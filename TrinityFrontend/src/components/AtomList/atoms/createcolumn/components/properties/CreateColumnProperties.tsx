
import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Settings, Eye } from 'lucide-react';
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
    <div className="h-full flex flex-col">
      <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="input" className="text-xs font-medium">
            <Upload className="w-3 h-3 mr-1" />
            Input
          </TabsTrigger>
          <TabsTrigger value="settings" className="text-xs font-medium">
            <Settings className="w-3 h-3 mr-1" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="exhibition" className="text-xs font-medium">
            <Eye className="w-3 h-3 mr-1" />
            Exhibition
          </TabsTrigger>
        </TabsList>
        <TabsContent value="input" className="flex-1 mt-0" forceMount>
          <CreateColumnInputFiles atomId={atomId} selectedIdentifiers={selectedIdentifiers} setSelectedIdentifiers={setSelectedIdentifiers} />
        </TabsContent>
        <TabsContent value="settings" className="flex-1 mt-0" forceMount>
          <CreateColumnSettings 
            operations={operations}
            onOperationsChange={handleOperationsChange}
          />
        </TabsContent>
        <TabsContent value="exhibition" className="flex-1 mt-0" forceMount>
          <CreateColumnExhibition settings={atom?.settings || {}} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CreateColumnProperties;