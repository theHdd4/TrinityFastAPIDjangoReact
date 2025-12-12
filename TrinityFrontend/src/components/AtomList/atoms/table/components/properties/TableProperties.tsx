import React, { useState } from 'react';
import { Upload, Settings, Eye } from 'lucide-react';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import TableInputs from './TableInputs';
import TableSettingsTab from './TableSettingsTab';
import TableExhibition from './TableExhibition';

interface Props {
  atomId: string;
}

const TableProperties: React.FC<Props> = ({ atomId }) => {
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const [tab, setTab] = useState('inputs');

  return (
    <div className="h-full flex flex-col">
      <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="inputs" className="text-xs font-medium">
            <Upload className="w-3 h-3 mr-1" />
            Inputs
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

        <TabsContent value="inputs" className="flex-1 mt-0">
          <TableInputs atomId={atomId} />
        </TabsContent>

        <TabsContent value="settings" className="flex-1 mt-0">
          <TableSettingsTab atomId={atomId} />
        </TabsContent>

        <TabsContent value="exhibition" className="flex-1 mt-0">
          <TableExhibition atomId={atomId} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default TableProperties;





