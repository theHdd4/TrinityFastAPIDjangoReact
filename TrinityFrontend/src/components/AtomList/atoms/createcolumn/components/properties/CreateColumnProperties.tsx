
import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import CreateColumnSettings from '../CreateColumnSettings';
import CreateColumnExhibition from '../CreateColumnExhibition';
import CreateColumnInputFiles from '../CreateColumnInputFiles';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';

interface Operation {
  id: string;
  type: 'add' | 'subtract' | 'multiply' | 'divide' | 'power' | 'sqrt' | 'log' | 'abs';
  name: string;
  column1?: string;
  column2?: string;
  value?: number;
  newColumnName: string;
}

interface CreateColumnPropertiesProps {
  atomId: string;
}

const CreateColumnProperties: React.FC<CreateColumnPropertiesProps> = ({ atomId }) => {
  const [tab, setTab] = useState('input');
  const [selectedIdentifiers, setSelectedIdentifiers] = useState<string[]>([]);
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const operations: Operation[] = (atom?.settings?.operations as Operation[]) || [];

  const handleOperationsChange = (newOperations: Operation[]) => {
    updateSettings(atomId, { operations: newOperations });
  };

  return (
    <Tabs value={tab} onValueChange={setTab} className="w-full h-full flex flex-col">
      <TabsList className="grid w-full grid-cols-3 bg-gray-50 mb-4 shrink-0 mx-4 mt-4">
        <TabsTrigger value="input" className="font-medium">Input Files</TabsTrigger>
        <TabsTrigger value="settings" className="font-medium">Settings</TabsTrigger>
        <TabsTrigger value="exhibition" className="font-medium">Exhibition</TabsTrigger>
      </TabsList>
      <div className="flex-1 overflow-auto px-4">
        <TabsContent value="input" className="mt-0 h-full" forceMount>
          <CreateColumnInputFiles atomId={atomId} selectedIdentifiers={selectedIdentifiers} setSelectedIdentifiers={setSelectedIdentifiers} />
        </TabsContent>
        <TabsContent value="settings" className="mt-0 h-full" forceMount>
          <CreateColumnSettings 
            operations={operations}
            onOperationsChange={handleOperationsChange}
          />
        </TabsContent>
        <TabsContent value="exhibition" className="mt-0 h-full" forceMount>
          <CreateColumnExhibition settings={atom?.settings || {}} />
        </TabsContent>
      </div>
    </Tabs>
  );
};

export default CreateColumnProperties;