import React, { useState } from 'react';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Eye } from 'lucide-react';

import EvaluateModelsFeatureSettings from '../EvaluateModelsFeatureSettings';
import EvaluateModelsFeatureExhibition from '../EvaluateModelsFeatureExhibition';

import { EvaluateModelsFeatureData, EvaluateModelsFeatureSettings as SettingsType } from '../../EvaluateModelsFeatureAtom';

// Props when used outside Laboratory Mode
interface StandaloneProps {
  data: EvaluateModelsFeatureData;
  settings: SettingsType;
  onDataChange: (data: Partial<EvaluateModelsFeatureData>) => void;
  onSettingsChange: (settings: Partial<SettingsType>) => void;
  onDataUpload: (file: File, fileId: string) => void;
  atomId?: string; // Optional atomId for Laboratory Mode
}

const InternalEvaluateModelsFeatureProperties: React.FC<StandaloneProps> = ({
  data,
  settings,
  onDataChange,
  onSettingsChange,
  onDataUpload
}) => {
  const [tab, setTab] = useState('inputs');

  return (
    <div className="h-full flex flex-col">
      <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="inputs" className="text-xs font-medium">
            <Upload className="w-3 h-3 mr-1" />
            Input
          </TabsTrigger>
          <TabsTrigger value="exhibition" className="text-xs font-medium">
            <Eye className="w-3 h-3 mr-1" />
            Exhibition
          </TabsTrigger>
        </TabsList>
        <TabsContent value="inputs" className="flex-1 mt-0" forceMount>
          <EvaluateModelsFeatureSettings
            data={data}
            settings={settings}
            onDataChange={onDataChange}
            onSettingsChange={onSettingsChange}
            onDataUpload={onDataUpload}
          />
        </TabsContent>
        <TabsContent value="exhibition" className="flex-1 mt-0" forceMount>
          {/* Exhibition tab content - empty for now */}
        </TabsContent>
      </Tabs>
    </div>
  );
};

// Wrapper component: if atomId provided, connect to store; else act as standalone UI
interface StoreProps { atomId: string; }

type Props = StoreProps | StandaloneProps;

const EvaluateModelsFeatureProperties: React.FC<Props> = (props) => {
  // Check if we have atomId (either from StoreProps or StandaloneProps)
  const atomId = 'atomId' in props ? props.atomId : (props as StandaloneProps).atomId;
  
  if (atomId) {
    const atom = useLaboratoryStore(state => state.getAtom(atomId));
    const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
    const { data = {}, settings = {} } = (atom?.settings || {}) as any;
    
    console.log('Properties Debug - Store data:', {
      atomId,
      atomSettings: atom?.settings,
      storeData: data,
      storeSelectedCombinations: data.selectedCombinations
    });

    // Provide complete default data structure
    const defaultData = {
      selectedDataframe: '',
      scope: 'SCOPE 12',
      selectedCombinations: ['Combination_1', 'Combination_2', 'Combination_3'] as string[],
      identifiers: [
        { id: '1', name: 'Identifier 3', selected: true },
        { id: '2', name: 'Identifier 4', selected: true },
        { id: '3', name: 'Identifier 6', selected: true },
        { id: '4', name: 'Identifier 7', selected: true },
        { id: '5', name: 'Identifier 15', selected: true },
      ],
      graphs: [
        { id: '1', name: 'Waterfall Chart', type: 'waterfall', selected: true },
        { id: '2', name: 'Contribution Chart', type: 'contribution', selected: true },
        { id: '3', name: 'Actual vs Predicted', type: 'actual-vs-predicted', selected: true },
        { id: '4', name: 'Elasticity', type: 'elasticity', selected: true },
        { id: '5', name: 'Beta', type: 'beta', selected: true },
        { id: '6', name: 'Averages', type: 'averages', selected: true },
      ],
      availableColumns: ['Column 1', 'Column 2', 'Column 3', 'Column 4'],
      modelResults: [] as any[],
    };

    const defaultSettings = { 
      showLegend: true, 
      chartHeight: 300, 
      autoRefresh: false 
    };

    // Ensure complete data structure - but preserve existing data
    const completeData = {
      ...defaultData,
      ...data,
      // Ensure selectedCombinations is preserved from store if it exists
      selectedCombinations: data.selectedCombinations || defaultData.selectedCombinations
    };

    const completeSettings = {
      ...defaultSettings,
      ...settings
    };

    return (
      <InternalEvaluateModelsFeatureProperties
        data={completeData as any}
        settings={completeSettings as any}
        onDataChange={d => {
          const updatedData = { ...completeData, ...d };
          console.log('Properties Debug - onDataChange:', {
            receivedData: d,
            completeData,
            updatedData
          });
          updateSettings(atomId, { data: updatedData });
        }}
        onSettingsChange={s => updateSettings(atomId, { settings: { ...completeSettings, ...s } })}
        onDataUpload={(file, fileId) =>
          updateSettings(atomId, {
            data: { ...completeData, selectedDataframe: file.name },
          })
        }
      />
    );
  }
  // Stand-alone usage without atomId
  return <InternalEvaluateModelsFeatureProperties {...(props as StandaloneProps)} />;
};

export default EvaluateModelsFeatureProperties;


