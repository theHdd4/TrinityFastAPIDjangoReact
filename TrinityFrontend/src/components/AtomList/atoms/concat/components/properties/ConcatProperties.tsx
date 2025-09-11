import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Database, Settings, Eye } from 'lucide-react';
import ConcatInputFiles from '../ConcatInputFiles';
import ConcatOptions from '../ConcatOptions';
import ConcatExhibition from '../ConcatExhibition';
import { useLaboratoryStore, DEFAULT_CONCAT_SETTINGS, ConcatSettings as SettingsType } from '@/components/LaboratoryMode/store/laboratoryStore';
import { CONCAT_API } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

interface Props {
  atomId: string;
}

const ConcatProperties: React.FC<Props> = ({ atomId }) => {
  const [tab, setTab] = useState('inputs');
  const { toast } = useToast();
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const settings: SettingsType = (atom?.settings as SettingsType) || { ...DEFAULT_CONCAT_SETTINGS };

  const handleChange = (newSettings: Partial<SettingsType>) => {
    updateSettings(atomId, newSettings);
  };

  // Helper function to check if all required options are selected
  const isConcatReady = () => {
    return settings.file1 && settings.file2 && settings.direction;
  };

  const handlePerformConcat = async () => {
    if (!isConcatReady()) {
      toast({
        title: "Error",
        description: "Please select both files and direction before performing concatenation.",
        variant: "destructive",
      });
      return;
    }
    try {
      const requestBody = {
        file1: settings.file1,
        file2: settings.file2,
        concat_direction: settings.direction,
      };
      const response = await fetch(`${CONCAT_API}/perform`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Concat failed: ${response.statusText} - ${errorText}`);
      }
      const result = await response.json();
      updateSettings(atomId, { 
        ...settings, // preserve previous selections
        concatResults: {
          ...result,
        },
        concatId: result.concat_id 
      });
      toast({
        title: "Success",
        description: `Concatenation completed! Result: ${result.result_shape[0]} rows, ${result.result_shape[1]} columns`,
      });
    } catch (error) {
      console.error('Concat error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to perform concatenation",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="w-full">
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 mx-4 my-4">
          <TabsTrigger value="inputs" className="text-xs">
            <Database className="w-3 h-3 mr-1" />
            Input Files
          </TabsTrigger>
          <TabsTrigger value="options" className="text-xs">
            <Settings className="w-3 h-3 mr-1" />
            Concat Options
          </TabsTrigger>
          <TabsTrigger value="exhibition" className="text-xs">
            <Eye className="w-3 h-3 mr-1" />
            Exhibition
          </TabsTrigger>
        </TabsList>

        <div className="px-4">
          <TabsContent value="inputs" className="space-y-4" forceMount>
            <ConcatInputFiles 
              settings={settings} 
              onSettingsChange={handleChange}
              onPerformConcat={handlePerformConcat}
            />
          </TabsContent>
          <TabsContent value="options" className="space-y-4" forceMount>
            <ConcatOptions 
              settings={settings} 
              onSettingsChange={handleChange}
              onPerformConcat={handlePerformConcat}
            />
          </TabsContent>
          <TabsContent value="exhibition" className="space-y-4" forceMount>
            <ConcatExhibition 
              settings={settings}
              onPerformConcat={handlePerformConcat}
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};

export default ConcatProperties; 