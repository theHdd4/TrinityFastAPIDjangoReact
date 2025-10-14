import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Minus, X, Divide, Circle, BarChart3, Calculator, Settings, TrendingDown, Activity, Calendar } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface Operation {
  id: string;
  type: 'add' | 'subtract' | 'multiply' | 'divide' | 'dummy' | 'rpi' | 'residual' | 'stl_outlier' | 'detrend' | 'deseasonalize' | 'detrend_deseasonalize' | 'datetime';
  name: string;
  newColumnName: string;
  columns: string[];
}

interface CreateColumnSettingsProps {
  operations: Operation[];
  onOperationsChange: (operations: Operation[]) => void;
}

const operationTypes = [
  { type: 'add', name: 'Addition', icon: Plus, description: 'Add two or more columns' },
  { type: 'subtract', name: 'Subtraction', icon: Minus, description: 'Subtract two or more columns' },
  { type: 'multiply', name: 'Multiplication', icon: X, description: 'Multiply two or more columns' },
  { type: 'divide', name: 'Division', icon: Divide, description: 'Divide two or more columns' },
  { type: 'dummy', name: 'Indicator Variable', icon: Circle, description: 'Create indicator variables (0/1) for categorical columns' },
  { type: 'rpi', name: 'RPI', icon: BarChart3, description: 'Relative Price Index calculation' },
  { type: 'residual', name: 'Residual', icon: TrendingDown, description: 'Calculate residuals (target vs predictors)' },
  { type: 'stl_outlier', name: 'STL Outlier', icon: Activity, description: 'Detect outliers using STL decomposition' },
  { type: 'detrend', name: 'Detrend', icon: TrendingDown, description: 'Remove trend from a column using STL decomposition' },
  { type: 'deseasonalize', name: 'Deseasonalize', icon: TrendingDown, description: 'Remove seasonality from a column using STL decomposition' },
  { type: 'detrend_deseasonalize', name: 'Detrend & Deseasonalize', icon: TrendingDown, description: 'Remove both trend and seasonality from a column using STL decomposition' },
  { type: 'power', name: 'Power', icon: Activity, description: 'Raise column(s) to a power (requires exponent parameter)' },
  { type: 'log', name: 'Log', icon: Activity, description: 'Natural logarithm of column(s)' },
  { type: 'sqrt', name: 'Square Root', icon: Activity, description: 'Square root of column(s)' },
  { type: 'exp', name: 'Exponential', icon: Activity, description: 'Exponential of column(s)' },
  // { type: 'marketshare', name: 'Market Share', icon: BarChart3, description: 'Calculate market share for brands' },
  // { type: 'kalman_filter', name: 'Kalman Filter', icon: Activity, description: 'Apply Kalman filter to volume' },
  { type: 'standardize_zscore', name: 'Standardize (Z-Score)', icon: Activity, description: 'Standardize column(s) using Z-Score' },
  { type: 'standardize_minmax', name: 'Standardize (Min-Max)', icon: Activity, description: 'Standardize column(s) using Min-Max scaling' },
  { type: 'logistic', name: 'Logistic', icon: Activity, description: 'Apply logistic transformation (requires gr, co, mp parameters)' },
  { type: 'datetime', name: 'DateTime Extract', icon: Calendar, description: 'Extract datetime components (year, month, week, day) from date column' },
];

const getDefaultColumns = (type: string) => {
  if (["add", "subtract", "multiply", "divide"].includes(type)) return ['', ''];
  return [''];
};

const CreateColumnSettings: React.FC<CreateColumnSettingsProps> = ({
  operations,
  onOperationsChange
}) => {
  const [search, setSearch] = React.useState('');

  const addOperation = (type: string, name: string) => {
    const newOperation: Operation = {
      id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: type as Operation['type'],
      name,
      newColumnName: `${name.toLowerCase().replace(/\s+/g, '_')}_${operations.length + 1}`,
      columns: getDefaultColumns(type)
    };
    onOperationsChange([...operations, newOperation]);
  };

  const removeOperation = (id: string) => {
    onOperationsChange(operations.filter(op => op.id !== id));
  };

  const filteredOperationTypes = operationTypes.filter(op =>
    op.name.toLowerCase().includes(search.toLowerCase()) ||
    op.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Available Operations Card with small heading and green gradient */}
      <Card className="bg-gradient-to-br from-green-50 to-green-100">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2 text-sm font-semibold">
            <Calculator className="w-5 h-5 text-green-500" />
            <span>Available Operations</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            type="text"
            placeholder="Search operations..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="mb-3 bg-white border border-green-200 focus:border-green-400 focus:ring-green-100"
          />
          <div className="max-h-64 overflow-y-auto grid grid-cols-1 gap-4 pr-2 scrollbar-thin scrollbar-thumb-green-200 scrollbar-track-green-50 rounded-md">
            {filteredOperationTypes.map((op) => (
              <div
                key={op.type}
                className="p-2 border border-gray-200 rounded-lg bg-white transition-all cursor-pointer group relative flex flex-col items-start min-h-[56px] w-full max-w-xs hover:scale-105 hover:shadow-lg hover:border-green-300 hover:bg-green-50"
                onClick={() => addOperation(op.type, op.name)}
              >
                <div className="flex items-center space-x-3 mb-2">
                  <div className="w-7 h-7 bg-green-100 rounded-lg flex items-center justify-center group-hover:bg-green-200 transition-colors">
                    <op.icon className="w-4 h-4 text-green-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 text-xs sm:text-sm">{op.name}</h4>
                  </div>
                </div>
                <p className="text-xs text-gray-600 line-clamp-2 max-w-[140px]">{op.description}</p>
                <Button
                  size="sm"
                  className="mt-2 w-full bg-green-500 hover:bg-green-600 text-white opacity-0 group-hover:opacity-100 transition-opacity absolute left-0 right-0 mx-auto bottom-2"
                  style={{ pointerEvents: 'auto' }}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Operation
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      {/* Selected Operations Card with small heading and blue gradient */}
      {operations.length > 0 && (
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-sm font-semibold">
              <Settings className="w-5 h-5 text-blue-500" />
              <span>Selected Operations ({operations.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-56 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-blue-200 scrollbar-track-blue-50 rounded-md">
              {operations.map((operation, index) => (
                <div
                  key={operation.id}
                  className="flex items-center justify-between p-2 bg-gray-50 rounded-lg border border-gray-200"
                >
                  <div className="flex items-center space-x-2">
                    <div className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center text-green-600 font-semibold text-xs">
                      {index + 1}
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-900 text-xs">{operation.name}</h4>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeOperation(operation.id)}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CreateColumnSettings;