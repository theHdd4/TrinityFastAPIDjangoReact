import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Settings, Eye } from 'lucide-react';
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
    // Ensure direction is set to default if not specified
    const updatedSettings = {
      ...newSettings,
      direction: newSettings.direction || settings.direction || DEFAULT_CONCAT_SETTINGS.direction
    };
    updateSettings(atomId, updatedSettings);
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
      // Get card_id and canvas_position for pipeline tracking
      const cards = useLaboratoryStore.getState().cards;
      const card = cards.find(c => Array.isArray(c.atoms) && c.atoms.some(a => a.id === atomId));
      const cardId = card?.id || '';
      const canvasPosition = card?.canvas_position ?? 0;
      
      const requestBody = {
        file1: settings.file1,
        file2: settings.file2,
        concat_direction: settings.direction,
        // Pipeline tracking parameters
        validator_atom_id: atomId,
        card_id: cardId,
        canvas_position: canvasPosition,
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
    <div className="h-full flex flex-col">
      <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="inputs" className="text-xs font-medium">
            <Upload className="w-3 h-3 mr-1" />
            Input
          </TabsTrigger>
          <TabsTrigger value="options" className="text-xs font-medium">
            <Settings className="w-3 h-3 mr-1" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="exhibition" className="text-xs font-medium">
            <Eye className="w-3 h-3 mr-1" />
            Exhibition
          </TabsTrigger>
        </TabsList>
        <TabsContent value="inputs" className="flex-1 mt-0" forceMount>
          <ConcatInputFiles 
            settings={settings} 
            onSettingsChange={handleChange}
            onPerformConcat={handlePerformConcat}
          />
        </TabsContent>
        <TabsContent value="options" className="flex-1 mt-0" forceMount>
          <ConcatOptions 
            settings={settings} 
            onSettingsChange={handleChange}
            onPerformConcat={handlePerformConcat}
          />
        </TabsContent>
        <TabsContent value="exhibition" className="flex-1 mt-0" forceMount>
          <ConcatExhibition 
            settings={settings}
            onPerformConcat={handlePerformConcat}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ConcatProperties; 
