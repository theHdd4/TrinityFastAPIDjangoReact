import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Settings, Eye } from 'lucide-react';
import { useLaboratoryStore, DEFAULT_CLUSTERING_SETTINGS, ClusteringSettings } from '@/components/LaboratoryMode/store/laboratoryStore';
import ClusteringInputFiles from '../ClusteringInputFiles';
import  ClusteringSelections  from '../ClusteringSelections';
import ClusteringExhibition from '../ClusteringExhibition';

interface Props { 
  atomId: string;
}

const ClusteringProperties: React.FC<Props> = ({ atomId }) => {
  console.log('🟢 ClusteringProperties rendered for atomId:', atomId);
  
  const [tab, setTab] = useState('inputs');
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const settings: ClusteringSettings = (atom?.settings as ClusteringSettings) || { ...DEFAULT_CLUSTERING_SETTINGS };
  
  console.log('🟢 ClusteringProperties current tab:', tab);
  console.log('🟢 ClusteringProperties atom data:', atom);
  console.log('🟢 ClusteringProperties settings:', settings);
  
  const handleChange = (newSettings: Partial<ClusteringSettings>) => {
    console.log('🔧 ClusteringProperties: Updating settings:', newSettings);
    updateSettings(atomId, newSettings);
  };

  return (
    <div className="h-full flex flex-col">
      <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="inputs" className="text-xs font-medium">
            <Upload className="w-3 h-3 mr-1" />
            Input
          </TabsTrigger>
          <TabsTrigger value="selections" className="text-xs font-medium">
            <Settings className="w-3 h-3 mr-1" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="exhibition" className="text-xs font-medium">
            <Eye className="w-3 h-3 mr-1" />
            Exhibition
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inputs" className="flex-1 mt-0" forceMount>
          <ClusteringInputFiles 
            atomId={atomId}
          />
        </TabsContent>
        <TabsContent value="selections" className="flex-1 mt-0" forceMount>
          <ClusteringSelections 
            atomId={atomId}
          />
        </TabsContent>
        <TabsContent value="exhibition" className="flex-1 mt-0" forceMount>
          <ClusteringExhibition 
            settings={settings}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ClusteringProperties;