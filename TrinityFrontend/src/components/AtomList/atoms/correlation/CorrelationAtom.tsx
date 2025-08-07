import React, { useState } from 'react';
import CorrelationCanvas from './components/CorrelationCanvas';
import CorrelationProperties from './components/CorrelationProperties';

export interface CorrelationData {
  variables: string[];
  selectedVar1: string;
  selectedVar2: string;
  correlationMatrix: number[][];
  timeSeriesData: Array<{
    date: Date;
    var1Value: number;
    var2Value: number;
  }>;
  identifiers: {
    identifier3: string;
    identifier4: string;
    identifier6: string;
    identifier7: string;
    identifier15: string;
  };
  settings: {
    dataSource: string;
    dataset: string;
    dateFrom: string;
    dateTo: string;
    aggregationLevel: string;
    correlationMethod: string;
    selectData: string;
    selectFilter: string;
    uploadedFile?: string;
  };
}

interface CorrelationAtomProps {
  onClose?: () => void;
  onPropertiesChange?: (data: any) => void;
}

const CorrelationAtom: React.FC<CorrelationAtomProps> = ({ onClose, onPropertiesChange }) => {
  const [data, setData] = useState<CorrelationData>({
    variables: ['Sales', 'Marketing Spend', 'Website Traffic', 'Customer Satisfaction', 'Product Quality', 'Pricing', 'Market Share', 'Competition'],
    selectedVar1: 'Sales',
    selectedVar2: 'Marketing Spend',
    correlationMatrix: [
      [1.0, 0.85, 0.72, 0.68, 0.45, -0.32, 0.78, -0.54],
      [0.85, 1.0, 0.68, 0.52, 0.38, -0.28, 0.65, -0.41],
      [0.72, 0.68, 1.0, 0.59, 0.42, -0.25, 0.71, -0.38],
      [0.68, 0.52, 0.59, 1.0, 0.73, -0.19, 0.64, -0.33],
      [0.45, 0.38, 0.42, 0.73, 1.0, -0.15, 0.48, -0.25],
      [-0.32, -0.28, -0.25, -0.19, -0.15, 1.0, -0.34, 0.42],
      [0.78, 0.65, 0.71, 0.64, 0.48, -0.34, 1.0, -0.58],
      [-0.54, -0.41, -0.38, -0.33, -0.25, 0.42, -0.58, 1.0]
    ],
    timeSeriesData: Array.from({ length: 24 }, (_, i) => ({
      date: new Date(2022, i, 1),
      var1Value: 1000 + Math.sin(i * 0.2) * 200 + Math.random() * 100,
      var2Value: 500 + Math.cos(i * 0.15) * 150 + Math.random() * 50
    })),
    identifiers: {
      identifier3: 'All',
      identifier4: 'All',
      identifier6: 'All',
      identifier7: 'All',
      identifier15: 'All'
    },
    settings: {
      dataSource: 'CSV',
      dataset: 'Sales_Data',
      dateFrom: '01 JUL 2020',
      dateTo: '30 MAR 2025',
      aggregationLevel: 'Monthly',
      correlationMethod: 'Pearson',
      selectData: 'Single Selection',
      selectFilter: 'Multi Selection',
      uploadedFile: 'sales_data.csv'
    }
  });

  const handleDataChange = (newData: Partial<CorrelationData>) => {
    const updatedData = { ...data, ...newData };
    setData(updatedData);
    if (onPropertiesChange) {
      onPropertiesChange({ 
        data: updatedData,
        onDataChange: handleDataChange,
        propertiesComponent: CorrelationProperties 
      });
    }
  };

  // Initialize properties when component mounts
  React.useEffect(() => {
    if (onPropertiesChange) {
      onPropertiesChange({ 
        data,
        onDataChange: handleDataChange,
        propertiesComponent: CorrelationProperties 
      });
    }
  }, [onPropertiesChange]);

  return (
    <div className="w-full h-full bg-background border border-border rounded-lg overflow-hidden">
      <CorrelationCanvas 
        data={data}
        onDataChange={handleDataChange}
      />
    </div>
  );
};

export default CorrelationAtom;