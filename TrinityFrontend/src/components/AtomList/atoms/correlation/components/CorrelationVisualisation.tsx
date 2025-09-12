import React from 'react';
import { CorrelationSettings } from '@/components/LaboratoryMode/store/laboratoryStore';

interface CorrelationVisualisationProps {
  data: CorrelationSettings;
  onDataChange: (newData: Partial<CorrelationSettings>) => void;
}

const CorrelationVisualisation: React.FC<CorrelationVisualisationProps> = () => {
  return <div className="p-2 space-y-2 h-full overflow-auto" />;
};

export default CorrelationVisualisation;
