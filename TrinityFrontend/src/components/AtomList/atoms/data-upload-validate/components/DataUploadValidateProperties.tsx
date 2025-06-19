import React, { useState } from 'react';
import {
  Settings,
  Upload,
  Table,
  BarChart3,
  Minus,
  Plus
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

const DataUploadValidateProperties: React.FC = () => {
  const [allAvailableFiles, setAllAvailableFiles] = useState<{ name: string; source: string }[]>([]);
  const [selectedMasterFile, setSelectedMasterFile] = useState<string>('');
  const [columnDataTypes, setColumnDataTypes] = useState<Record<string, string>>({
    Column1: 'string',
    Column2: 'number',
    Column3: 'date'
  });
  const dataTypeOptions = [
    { value: 'string', label: 'String' },
    { value: 'number', label: 'Number' },
    { value: 'date', label: 'Date' }
  ];

  interface RangeValidation {
    id: number;
    column: string;
    min: string;
    max: string;
  }

  const [rangeValidations, setRangeValidations] = useState<RangeValidation[]>([
    { id: 1, column: '', min: '', max: '' }
  ]);

  interface PeriodicityValidation {
    id: number;
    column: string;
    periodicity: string;
  }

  const [periodicityValidations, setPeriodicityValidations] = useState<PeriodicityValidation[]>([
    { id: 1, column: '', periodicity: '' }
  ]);

  const numericalColumns = ['Column1', 'Column2'];
  const dateColumns = ['Column3'];

  const periodicityOptions = [
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' }
  ];

  const dimensions = [
    'Brand',
    'Category',
    'Region',
    'Channel',
    'Season',
    'Customer_Segment',
    'Product_Type',
    'Price_Tier',
    'Market',
    'Distribution',
    'Segment',
    'SKU'
  ];

  const measures = [
    'Volume_Sales',
    'Value_Sales',
    'Revenue',
    'Profit',
    'Units_Sold',
    'Market_Share',
    'Price',
    'Cost',
    'Margin',
    'Discount',
    'Promotion_Lift',
    'Base_Sales'
  ];

  const handleMasterFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files).map(f => ({ name: f.name, source: 'upload' }));
      setAllAvailableFiles(prev => [...prev, ...files]);
    }
  };

  const handleDataTypeChange = (column: string, value: string) => {
    setColumnDataTypes(prev => ({ ...prev, [column]: value }));
  };

  const addRangeValidation = () => {
    setRangeValidations(prev => [...prev, { id: Date.now(), column: '', min: '', max: '' }]);
  };

  const removeRangeValidation = (id: number) => {
    setRangeValidations(prev => prev.filter(r => r.id !== id));
  };

  const updateRangeValidation = (id: number, key: 'column' | 'min' | 'max', value: string) => {
    setRangeValidations(prev => prev.map(r => (r.id === id ? { ...r, [key]: value } : r)));
  };

  const addPeriodicityValidation = () => {
    setPeriodicityValidations(prev => [...prev, { id: Date.now(), column: '', periodicity: '' }]);
  };

  const removePeriodicityValidation = (id: number) => {
    setPeriodicityValidations(prev => prev.filter(p => p.id !== id));
  };

  const updatePeriodicityValidation = (
    id: number,
    key: 'column' | 'periodicity',
    value: string
  ) => {
    setPeriodicityValidations(prev => prev.map(p => (p.id === id ? { ...p, [key]: value } : p)));
  };

  return (
    <div className="w-80 bg-white border-l border-gray-200 flex flex-col">
      <div className="p-3 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900 flex items-center space-x-2">
          <Settings className="w-4 h-4" />
          <span>Data Upload and Validate Properties</span>
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300">
        {/* Master File Upload Section */}
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">Upload Master File</label>
              <input
                type="file"
                multiple
                accept=".csv,.xlsx,.xls,.json"
                onChange={handleMasterFileSelect}
                className="hidden"
                id="master-file-upload"
              />
              <label htmlFor="master-file-upload">
                <Button asChild variant="outline" className="w-full cursor-pointer border-gray-300">
                  <span className="flex items-center justify-center space-x-2">
                    <Upload className="w-4 h-4" />
                    <span>Choose Files</span>
                  </span>
                </Button>
              </label>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">Select Master File</label>
              <Select value={selectedMasterFile} onValueChange={setSelectedMasterFile}>
                <SelectTrigger className="bg-white border-gray-300">
                  <SelectValue placeholder="Select a master file..." />
                </SelectTrigger>
                <SelectContent>
                  {allAvailableFiles.length === 0 ? (
                    <SelectItem value="no-files" disabled>
                      No files available
                    </SelectItem>
                  ) : (
                    allAvailableFiles.map((file, index) => (
                      <SelectItem key={`${file.source}-${index}`} value={file.name}>
                        {file.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Tabs Section - Only active when master file is selected */}
        {selectedMasterFile && selectedMasterFile !== 'no-files' && (
          <Tabs defaultValue="datatype" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mx-4 my-4">
              <TabsTrigger value="datatype" className="text-xs">
                <Table className="w-3 h-3 mr-1" />
                DataType
              </TabsTrigger>
              <TabsTrigger value="value" className="text-xs">
                <BarChart3 className="w-3 h-3 mr-1" />
                Value
              </TabsTrigger>
              <TabsTrigger value="dimension" className="text-xs">
                <Settings className="w-3 h-3 mr-1" />
                Dimension
              </TabsTrigger>
            </TabsList>

            <div className="px-4">
              <TabsContent value="datatype" className="space-y-4">
                <div className="pt-4">
                  <h4 className="text-sm font-medium text-gray-900 mb-3">Column Data Types</h4>
                  <div className="space-y-3">
                    {Object.entries(columnDataTypes).map(([columnName, dataType]) => (
                      <div
                        key={columnName}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
                      >
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">{columnName}</p>
                          <p className="text-xs text-gray-600">Data Type</p>
                        </div>
                        <Select value={dataType} onValueChange={value => handleDataTypeChange(columnName, value)}>
                          <SelectTrigger className="w-20 h-8 text-xs bg-white border-gray-300">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {dataTypeOptions.map(option => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="value" className="space-y-4">
                <div className="pt-4">
                  <h4 className="text-sm font-medium text-gray-900 mb-4">Value Settings</h4>

                  {/* Range Validation Section */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h5 className="text-sm font-medium text-gray-700">Range Validation</h5>
                      <Button onClick={addRangeValidation} size="sm" variant="outline" className="h-7 px-2">
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>

                    {rangeValidations.map(range => (
                      <div
                        key={range.id}
                        className="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-medium text-gray-700">Column</label>
                          {rangeValidations.length > 1 && (
                            <Button
                              onClick={() => removeRangeValidation(range.id)}
                              size="sm"
                              variant="outline"
                              className="h-6 px-2"
                            >
                              <Minus className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                        <Select
                          value={range.column}
                          onValueChange={value => updateRangeValidation(range.id, 'column', value)}
                        >
                          <SelectTrigger className="bg-white border-gray-300 h-8 text-xs">
                            <SelectValue placeholder="Select numerical column..." />
                          </SelectTrigger>
                          <SelectContent>
                            {numericalColumns.map(column => (
                              <SelectItem key={column} value={column}>
                                {column}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs font-medium text-gray-700 block mb-1">Min</label>
                            <Input
                              placeholder="Min value"
                              value={range.min}
                              onChange={e => updateRangeValidation(range.id, 'min', e.target.value)}
                              className="bg-white border-gray-300 h-8 text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-700 block mb-1">Max</label>
                            <Input
                              placeholder="Max value"
                              value={range.max}
                              onChange={e => updateRangeValidation(range.id, 'max', e.target.value)}
                              className="bg-white border-gray-300 h-8 text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Periodicity Validation Section */}
                  <div className="space-y-4 mt-6">
                    <div className="flex items-center justify-between">
                      <h5 className="text-sm font-medium text-gray-700">Periodicity Validation</h5>
                      <Button onClick={addPeriodicityValidation} size="sm" variant="outline" className="h-7 px-2">
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>

                    {periodicityValidations.map(periodicity => (
                      <div
                        key={periodicity.id}
                        className="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-medium text-gray-700">Date Column</label>
                          {periodicityValidations.length > 1 && (
                            <Button
                              onClick={() => removePeriodicityValidation(periodicity.id)}
                              size="sm"
                              variant="outline"
                              className="h-6 px-2"
                            >
                              <Minus className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                        <Select
                          value={periodicity.column}
                          onValueChange={value => updatePeriodicityValidation(periodicity.id, 'column', value)}
                        >
                          <SelectTrigger className="bg-white border-gray-300 h-8 text-xs">
                            <SelectValue placeholder="Select date column..." />
                          </SelectTrigger>
                          <SelectContent>
                            {dateColumns.map(column => (
                              <SelectItem key={column} value={column}>
                                {column}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div>
                          <label className="text-xs font-medium text-gray-700 block mb-1">Periodicity</label>
                          <Select
                            value={periodicity.periodicity}
                            onValueChange={value => updatePeriodicityValidation(periodicity.id, 'periodicity', value)}
                          >
                            <SelectTrigger className="bg-white border-gray-300 h-8 text-xs">
                              <SelectValue placeholder="Select periodicity..." />
                            </SelectTrigger>
                            <SelectContent>
                              {periodicityOptions.map(option => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="dimension" className="space-y-4">
                <div className="pt-4">
                  <h4 className="text-sm font-medium text-gray-900 mb-3">Dimension Settings</h4>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-3">Identifiers</label>
                      <div className="grid grid-cols-2 gap-2">
                        {dimensions.map((dim, index) => (
                          <Badge
                            key={index}
                            variant="outline"
                            className="text-xs justify-center py-1 bg-white border-gray-300 hover:bg-blue-50 hover:border-blue-300 cursor-pointer transition-colors"
                          >
                            {dim}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-3">Measures</label>
                      <div className="grid grid-cols-2 gap-2">
                        {measures.map((measure, index) => (
                          <Badge
                            key={index}
                            variant="outline"
                            className="text-xs justify-center py-1 bg-white border-gray-300 hover:bg-green-50 hover:border-green-300 cursor-pointer transition-colors"
                          >
                            {measure}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <Button variant="outline" size="sm" className="w-full border-gray-300">
                      <Plus className="w-3 h-3 mr-1" />
                      Add Custom Dimension
                    </Button>
                  </div>
                </div>
              </TabsContent>
            </div>

            <div className="p-4 border-t border-gray-200 mt-4">
              <Button className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-lg">
                Save Configuration
              </Button>
            </div>
          </Tabs>
        )}

        {/* Message when no master file is selected */}
        {(!selectedMasterFile || selectedMasterFile === 'no-files') && (
          <div className="p-8 text-center text-gray-500">
            <Table className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p className="text-sm">Select a master file to configure data types and settings</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DataUploadValidateProperties;

