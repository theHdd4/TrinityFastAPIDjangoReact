import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Database, Filter, Eye } from 'lucide-react';
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
    <div className="w-full">
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 mx-4 my-4">
          <TabsTrigger value="inputs" className="text-xs">
            <Database className="w-3 h-3 mr-1" />
            Input Files
          </TabsTrigger>
          <TabsTrigger value="selections" className="text-xs">
            <Filter className="w-3 h-3 mr-1" />
            Selections
          </TabsTrigger>
          <TabsTrigger value="exhibition" className="text-xs">
            <Eye className="w-3 h-3 mr-1" />
            Exhibition
          </TabsTrigger>
        </TabsList>

        <div className="px-4">
          <TabsContent value="inputs" className="space-y-4" forceMount>
            <ClusteringInputFiles 
              atomId={atomId}
            />
          </TabsContent>
          <TabsContent value="selections" className="space-y-4" forceMount>
            <ClusteringSelections 
              atomId={atomId}
            />
          </TabsContent>
          <TabsContent value="exhibition" className="space-y-4" forceMount>
            <ClusteringExhibition 
              settings={settings}
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};

export default ClusteringProperties;