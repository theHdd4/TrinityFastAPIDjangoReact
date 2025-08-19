import React from 'react';
import { X, Play, Save, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Card } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, ScatterChart, Scatter } from 'recharts';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';

interface SelectModelsFeatureCanvasProps {
  atomId: string;
  data: any;
}

const COLORS = [
  'hsl(24 95% 53%)',    // Orange primary
  'hsl(197 92% 61%)',   // Teal blue
  'hsl(262 83% 58%)',   // Purple
  'hsl(173 58% 39%)',   // Dark teal
  'hsl(43 74% 66%)',    // Golden yellow
  'hsl(215 28% 17%)'    // Navy blue
];

const SelectModelsFeatureCanvas: React.FC<SelectModelsFeatureCanvasProps> = ({
  atomId,
  data
}) => {
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);

  const handleDataChange = (newData: Partial<any>) => {
    updateSettings(atomId, newData);
  };

  const performanceData = [
    { name: 'Model A', value: 85 },
    { name: 'Model B', value: 78 },
    { name: 'Model C', value: 92 }
  ];

  const predictedVsActual = [
    { actual: 10, predicted: 12 },
    { actual: 20, predicted: 18 },
    { actual: 15, predicted: 16 },
    { actual: 25, predicted: 24 },
    { actual: 30, predicted: 28 }
  ];

  const contributionData = [
    { name: 'Feature A', value: 35 },
    { name: 'Feature B', value: 25 },
    { name: 'Feature C', value: 20 },
    { name: 'Feature D', value: 20 }
  ];

  const yoyGrowthData = [
    { name: 'Q1', value: 12 },
    { name: 'Q2', value: -8 },
    { name: 'Q3', value: 15 },
    { name: 'Q4', value: 6 }
  ];

  const handleFilterChange = (filterType: keyof typeof data.modelFilters, value: number[]) => {
    handleDataChange({
      modelFilters: {
        ...data.modelFilters,
        [filterType]: value[0]
      }
    });
  };

  return (
    <div className="w-full h-full bg-gradient-to-br from-orange-50/30 via-background to-blue-50/20">
      <div className="p-6 overflow-y-auto">
        {/* Top Section: Results and Filters */}
        <div className="flex gap-6 mb-8">
          {/* Results Section */}
          <div className="flex-1 bg-white/80 backdrop-blur-sm rounded-xl border border-orange-200/30 p-6 shadow-lg">
            {/* Scope Selector */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-medium text-orange-800">Scope:</span>
                {data.availableScopes.map((scope: string, index: number) => (
                  <React.Fragment key={scope}>
                    <Badge 
                      variant={data.selectedScope === scope ? "default" : "secondary"}
                      className={`cursor-pointer transition-all duration-200 hover:scale-105 ${
                        data.selectedScope === scope 
                          ? "bg-orange-500 text-white shadow-md" 
                          : "bg-orange-100 text-orange-700 hover:bg-orange-200"
                      }`}
                      onClick={() => handleDataChange({ selectedScope: scope })}
                    >
                      {scope}
                    </Badge>
                    {index < data.availableScopes.length - 1 && (
                      <span className="text-orange-400">•</span>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* Variable Selector */}
            <div className="mb-6">
              <Select 
                value={data.selectedVariable} 
                onValueChange={(value) => handleDataChange({ selectedVariable: value })}
              >
                <SelectTrigger className="border-orange-200 focus:border-orange-400">
                  <SelectValue placeholder="Select Variable to View Model Results" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Select Variable to View Model Results">Select Variable to View Model Results</SelectItem>
                  <SelectItem value="Variable A">Variable A</SelectItem>
                  <SelectItem value="Variable B">Variable B</SelectItem>
                  <SelectItem value="Variable C">Variable C</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Model Results Chart */}
            <div className="mb-6">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.modelResults}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" stroke="#888" />
                  <YAxis stroke="#888" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'white', 
                      border: '1px solid #f0f0f0',
                      borderRadius: '8px'
                    }}
                  />
                  <Bar dataKey="value" fill="hsl(24 95% 53%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Filters Section */}
          <div className="w-80 bg-white/80 backdrop-blur-sm rounded-xl border border-orange-200/30 p-6 shadow-lg">
            <div className="flex items-center gap-2 mb-4">
              <Filter className="h-4 w-4 text-orange-600" />
              <h3 className="text-lg font-semibold text-orange-900">Model Filters</h3>
            </div>

            {/* Scrollable filters container */}
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-orange-300 scrollbar-track-orange-100">
              {/* MAPE Filter */}
              <div className="bg-white/80 rounded-lg p-3 shadow-sm border border-orange-100/50">
                <label className="text-sm font-medium text-orange-800 mb-2 block">MAPE</label>
                <Slider
                  value={[data.modelFilters.mape]}
                  onValueChange={(value) => handleFilterChange('mape', value)}
                  max={1}
                  min={0}
                  step={0.01}
                  className="mb-2 [&_[role=slider]]:bg-orange-500 [&_[role=slider]]:border-orange-600 [&_[role=slider]]:h-3 [&_[role=slider]]:w-3 [&_.slider-track]:h-1"
                />
                <span className="text-xs text-orange-600 font-medium">{(data.modelFilters.mape * 100).toFixed(0)}%</span>
              </div>

              {/* P-Value Filter */}
              <div className="bg-white/80 rounded-lg p-3 shadow-sm border border-orange-100/50">
                <label className="text-sm font-medium text-orange-800 mb-2 block">P-Value</label>
                <Slider
                  value={[data.modelFilters.pValue]}
                  onValueChange={(value) => handleFilterChange('pValue', value)}
                  max={1}
                  min={0}
                  step={0.01}
                  className="mb-2 [&_[role=slider]]:bg-orange-500 [&_[role=slider]]:border-orange-600 [&_[role=slider]]:h-3 [&_[role=slider]]:w-3 [&_.slider-track]:h-1"
                />
                <span className="text-xs text-orange-600 font-medium">{(data.modelFilters.pValue * 100).toFixed(0)}%</span>
              </div>

              {/* R-Squared Filter */}
              <div className="bg-white/80 rounded-lg p-3 shadow-sm border border-orange-100/50">
                <label className="text-sm font-medium text-orange-800 mb-2 block">R-Squared</label>
                <Slider
                  value={[data.modelFilters.rSquared]}
                  onValueChange={(value) => handleFilterChange('rSquared', value)}
                  max={1}
                  min={0}
                  step={0.01}
                  className="mb-2 [&_[role=slider]]:bg-orange-500 [&_[role=slider]]:border-orange-600 [&_[role=slider]]:h-3 [&_[role=slider]]:w-3 [&_.slider-track]:h-1"
                />
                <span className="text-xs text-orange-600 font-medium">{(data.modelFilters.rSquared * 100).toFixed(0)}%</span>
              </div>

              {/* AIC Filter */}
              <div className="bg-white/80 rounded-lg p-3 shadow-sm border border-orange-100/50">
                <label className="text-sm font-medium text-orange-800 mb-2 block">AIC</label>
                <Slider
                  value={[data.modelFilters.aic]}
                  onValueChange={(value) => handleFilterChange('aic', value)}
                  max={1}
                  min={0}
                  step={0.01}
                  className="mb-2 [&_[role=slider]]:bg-orange-500 [&_[role=slider]]:border-orange-600 [&_[role=slider]]:h-3 [&_[role=slider]]:w-3 [&_.slider-track]:h-1"
                />
                <span className="text-xs text-orange-600 font-medium">{(data.modelFilters.aic * 100).toFixed(0)}%</span>
              </div>

              {/* Additional Filters */}
              <div className="bg-white/80 rounded-lg p-3 shadow-sm border border-orange-100/50">
                <label className="text-sm font-medium text-orange-800 mb-2 block">Filter ##</label>
                <Select>
                  <SelectTrigger className="border-orange-200 focus:border-orange-500 focus:ring-orange-200">
                    <SelectValue placeholder="Multi Selection" />
                  </SelectTrigger>
                  <SelectContent className="border-orange-200">
                    <SelectItem value="filter1">Filter Option 1</SelectItem>
                    <SelectItem value="filter2">Filter Option 2</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="bg-white/80 rounded-lg p-3 shadow-sm border border-orange-100/50">
                <label className="text-sm font-medium text-orange-800 mb-2 block">Filter ##</label>
                <Select>
                  <SelectTrigger className="border-orange-200 focus:border-orange-500 focus:ring-orange-200">
                    <SelectValue placeholder="Multi Selection" />
                  </SelectTrigger>
                  <SelectContent className="border-orange-200">
                    <SelectItem value="filter1">Filter Option 1</SelectItem>
                    <SelectItem value="filter2">Filter Option 2</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* More example filters to show scrolling */}
              <div className="bg-white/80 rounded-lg p-3 shadow-sm border border-orange-100/50">
                <label className="text-sm font-medium text-orange-800 mb-3 block">Category Filter</label>
                <Select>
                  <SelectTrigger className="border-orange-200 focus:border-orange-500 focus:ring-orange-200">
                    <SelectValue placeholder="Select Category" />
                  </SelectTrigger>
                  <SelectContent className="border-orange-200">
                    <SelectItem value="cat1">Category A</SelectItem>
                    <SelectItem value="cat2">Category B</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="bg-white/80 rounded-lg p-4 shadow-sm border border-orange-100/50">
                <label className="text-sm font-medium text-orange-800 mb-3 block">Date Range</label>
                <Select>
                  <SelectTrigger className="border-orange-200 focus:border-orange-500 focus:ring-orange-200">
                    <SelectValue placeholder="Select Range" />
                  </SelectTrigger>
                  <SelectContent className="border-orange-200">
                    <SelectItem value="range1">Last 30 days</SelectItem>
                    <SelectItem value="range2">Last 90 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Add Filter Button */}
              <Button variant="outline" className="w-full border-orange-300 text-orange-700 hover:bg-orange-100 hover:border-orange-400 transition-all duration-200">
                (+) Add a Filter
              </Button>
            </div>
          </div>
        </div>

        {/* Separator Line */}
        <div className="flex items-center my-8">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-orange-300 to-transparent"></div>
          <span className="px-4 text-sm text-orange-600 font-medium">Model Performance Analysis</span>
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-orange-300 to-transparent"></div>
        </div>

        {/* Model Performance Section - Full Width */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-orange-200/30 p-6 shadow-lg">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-orange-900 mb-4">Model Performance</h3>
            <Select value={data.selectedModel} onValueChange={(value) => handleDataChange({ selectedModel: value })}>
              <SelectTrigger className="w-full max-w-md border-orange-200 focus:border-orange-500 focus:ring-orange-200">
                <SelectValue placeholder="Select Model to View Model Performance" />
              </SelectTrigger>
              <SelectContent className="border-orange-200">
                <SelectItem value="model1">Linear Regression</SelectItem>
                <SelectItem value="model2">Random Forest</SelectItem>
                <SelectItem value="model3">XGBoost</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Performance Charts Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            {/* Performance Bar Chart */}
            <div className="bg-white rounded-lg p-4 shadow-sm border border-orange-100/50 hover:shadow-md transition-all duration-200">
              <h5 className="text-sm font-medium text-orange-800 mb-3">Performance</h5>
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={performanceData}>
                  <Bar dataKey="value" fill={COLORS[0]} radius={4} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Predicted vs Actual Scatter */}
            <div className="bg-white rounded-lg p-4 shadow-sm border border-orange-100/50 hover:shadow-md transition-all duration-200">
              <h5 className="text-sm font-medium text-orange-800 mb-3">Predicted vs Actual</h5>
              <ResponsiveContainer width="100%" height={150}>
                <ScatterChart data={predictedVsActual}>
                  <XAxis dataKey="actual" domain={['dataMin', 'dataMax']} fontSize={10} />
                  <YAxis dataKey="predicted" domain={['dataMin', 'dataMax']} fontSize={10} />
                  <Scatter dataKey="predicted" fill={COLORS[1]} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>

            {/* Contribution Pie Chart */}
            <div className="bg-white rounded-lg p-4 shadow-sm border border-orange-100/50 hover:shadow-md transition-all duration-200">
              <h5 className="text-sm font-medium text-orange-800 mb-3">Contribution</h5>
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie
                    data={contributionData}
                    dataKey="value"
                    outerRadius={50}
                  >
                    {contributionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Y-O-Y Growth */}
            <div className="bg-white rounded-lg p-4 shadow-sm border border-orange-100/50 hover:shadow-md transition-all duration-200">
              <h5 className="text-sm font-medium text-orange-800 mb-3">Y-O-Y Growth</h5>
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={yoyGrowthData}>
                  <Bar 
                    dataKey="value" 
                    fill={COLORS[2]}
                    radius={4} 
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* P-Value Grid */}
            <div className="bg-white rounded-lg p-4 shadow-sm border border-orange-100/50 hover:shadow-md transition-all duration-200">
              <h5 className="text-sm font-medium text-orange-800 mb-3">P-Value</h5>
              <div className="grid grid-cols-3 gap-1 h-[150px]">
                {Array.from({ length: 9 }, (_, i) => (
                  <div 
                    key={i} 
                    className="bg-gradient-to-br from-orange-100 to-orange-50 border border-orange-200/50 rounded-sm flex items-center justify-center text-xs text-orange-700 font-medium hover:from-orange-200 hover:to-orange-100 transition-all duration-200"
                  >
                    {(Math.random() * 0.1).toFixed(3)}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Save Results */}
          <div className="pt-4 border-t border-orange-200/50">
            <Button className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105">
              <Save className="h-4 w-4 mr-2" />
              Save Results
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SelectModelsFeatureCanvas;