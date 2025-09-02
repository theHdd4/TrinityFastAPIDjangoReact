import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend, Tooltip } from 'recharts';

interface ScenarioData {
  identifiers: Record<string, string>;
  prediction: number;
  pct_uplift: number;
  combinationLabel: string;
  run_id: string;
  baseline?: number;
  delta?: number;
  features?: Record<string, any>;
}

interface ScenarioResultsChartProps {
  data: ScenarioData[];
  width?: number;
  height?: number;
  viewMode?: 'hierarchy' | 'flat';
  viewIdentifiers?: Record<string, string[]>;
}

export const ScenarioResultsChart: React.FC<ScenarioResultsChartProps> = ({ 
  data, 
  width = 800, 
  height = 400,
  viewMode = 'hierarchy',
  viewIdentifiers
}) => {
  // Transform data for Recharts format
  const chartData = data.map(item => ({
    name: item.combinationLabel,
    baseline: item.baseline || 0,
    scenario: item.prediction,
    uplift: item.pct_uplift,
    delta: item.delta || 0
  }));

  // Custom tooltip content
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const baselineData = payload.find((p: any) => p.dataKey === 'baseline');
      const scenarioData = payload.find((p: any) => p.dataKey === 'scenario');
      
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-semibold text-gray-800 mb-2">{label}</p>
          {baselineData && (
            <p className="text-blue-600 text-sm">
              Baseline: {baselineData.value?.toLocaleString() || 'N/A'}
            </p>
          )}
          {scenarioData && (
            <p className="text-green-600 text-sm">
              Scenario: {scenarioData.value?.toLocaleString() || 'N/A'}
            </p>
          )}
          {scenarioData && baselineData && (
            <p className="text-gray-600 text-sm">
              Uplift: {((scenarioData.value - baselineData.value) / baselineData.value * 100).toFixed(2)}%
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
        <div className="text-center">
          <div className="text-lg font-medium text-gray-600 mb-2">No Results Available</div>
          <div className="text-sm text-gray-500">Run a scenario to see results</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-800 text-center">
          {viewMode === 'hierarchy' ? 'Individual Results' : 'Aggregated Results'}
        </h3>
      </div>
      
      <ResponsiveContainer width="100%" height={height}>
        <BarChart 
          data={chartData} 
          margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
        >
          <defs>
            {/* Baseline bar gradient */}
            <linearGradient id="baselineGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={1}/>
              <stop offset="100%" stopColor="#1d4ed8" stopOpacity={0.8}/>
            </linearGradient>
            
            {/* Scenario bar gradient */}
            <linearGradient id="scenarioGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22c55e" stopOpacity={1}/>
              <stop offset="100%" stopColor="#16a34a" stopOpacity={0.8}/>
            </linearGradient>
            
            {/* Shadow filter */}
            <filter id="barShadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="4" stdDeviation="4" floodOpacity="0.2" floodColor="#000"/>
            </filter>
          </defs>
          
          <CartesianGrid 
            strokeDasharray="3 3" 
            stroke="#e2e8f0" 
            strokeOpacity={0.6}
            vertical={false}
          />
          
          <XAxis 
            dataKey="name" 
            stroke="#64748b"
            fontSize={11}
            fontWeight={500}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            angle={-45}
            textAnchor="end"
            height={80}
          />
          
          <YAxis 
            stroke="#64748b"
            fontSize={11}
            fontWeight={500}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            width={60}
            tickFormatter={(value) => value.toLocaleString()}
          />
          
          <Tooltip content={<CustomTooltip />} />
          
          <Legend 
            verticalAlign="top" 
            height={36}
            wrapperStyle={{
              paddingBottom: '10px'
            }}
          />
          
          {/* Baseline bars */}
          <Bar 
            dataKey="baseline" 
            fill="url(#baselineGradient)"
            radius={[4, 4, 0, 0]}
            filter="url(#barShadow)"
            name="Baseline"
          />
          
          {/* Scenario bars */}
          <Bar 
            dataKey="scenario" 
            fill="url(#scenarioGradient)"
            radius={[4, 4, 0, 0]}
            filter="url(#barShadow)"
            name="Scenario"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default ScenarioResultsChart;
