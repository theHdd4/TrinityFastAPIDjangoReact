import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import CorrelationSettings from './CorrelationSettings';
import CorrelationExhibition from './CorrelationExhibition';
import CorrelationVisualisation from './CorrelationVisualisation';
import { CorrelationData } from '../CorrelationAtom';

interface CorrelationPropertiesProps {
  data: CorrelationData;
  onDataChange: (newData: Partial<CorrelationData>) => void;
}

const CorrelationProperties: React.FC<CorrelationPropertiesProps> = ({ data, onDataChange }) => {
  return (
    <div className="w-full h-full flex flex-col bg-background">
      <Tabs defaultValue="settings" className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="exhibition">Exhibition</TabsTrigger>
          <TabsTrigger value="visualisation">Visualisation</TabsTrigger>
        </TabsList>
        
        <TabsContent value="settings" className="flex-1 p-0">
          <CorrelationSettings data={data} onDataChange={onDataChange} />
        </TabsContent>
        
        <TabsContent value="exhibition" className="flex-1 p-0">
          <CorrelationExhibition data={data} />
        </TabsContent>
        
        <TabsContent value="visualisation" className="flex-1 p-0">
          <CorrelationVisualisation data={data} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CorrelationProperties;