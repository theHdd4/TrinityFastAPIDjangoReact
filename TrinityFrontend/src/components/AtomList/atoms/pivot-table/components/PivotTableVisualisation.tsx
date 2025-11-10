import React from 'react';
import { PivotTableSettings } from '@/components/LaboratoryMode/store/laboratoryStore';

interface PivotTableVisualisationProps {
  data: PivotTableSettings;
}

const PivotTableVisualisation: React.FC<PivotTableVisualisationProps> = ({ data }) => {
  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-lg p-4 text-center">
        <p className="text-sm text-muted-foreground">
          Chart visualization will appear here based on your pivot table data
        </p>
      </div>
    </div>
  );
};

export default PivotTableVisualisation;

