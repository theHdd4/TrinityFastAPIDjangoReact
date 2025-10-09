import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Settings, Eye } from 'lucide-react';
import FeatureOverviewSettings from '../FeatureOverviewSettings';
import FeatureOverviewVisualisation from '../FeatureOverviewVisualisation';
import FeatureOverviewExhibition from '../FeatureOverviewExhibition';
import { useLaboratoryStore, DEFAULT_FEATURE_OVERVIEW_SETTINGS, FeatureOverviewSettings as SettingsType } from '@/components/LaboratoryMode/store/laboratoryStore';

interface Props {
  atomId: string;
}

const FeatureOverviewProperties: React.FC<Props> = ({ atomId }) => {
  const [tab, setTab] = useState('settings');
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const cardId = useLaboratoryStore(state => {
    const card = state.cards.find(card => card.atoms.some(atom => atom.id === atomId));
    return card?.id;
  });
  const settings: SettingsType = (atom?.settings as SettingsType) || { ...DEFAULT_FEATURE_OVERVIEW_SETTINGS };

  const [pendingY, setPendingY] = useState<string[]>(settings.yAxes || []);
  const [pendingX, setPendingX] = useState<string>(settings.xAxis || 'date');

  useEffect(() => {
    setPendingY(settings.yAxes || []);
  }, [settings.yAxes]);

  useEffect(() => {
    setPendingX(settings.xAxis || 'date');
  }, [settings.xAxis]);

  const handleChange = (newSettings: Partial<SettingsType>) => {
    updateSettings(atomId, newSettings);
  };

  const applyVisual = () => {
    updateSettings(atomId, { yAxes: pendingY, xAxis: pendingX });
  };

  const handleRemoveExhibitionSelection = React.useCallback(
    (key: string) => {
      const current = Array.isArray(settings.exhibitionSelections)
        ? settings.exhibitionSelections
        : [];
      const next = current.filter(selection => selection.key !== key);
      updateSettings(atomId, { exhibitionSelections: next });
    },
    [atomId, settings.exhibitionSelections, updateSettings],
  );

  return (
    <div className="h-full flex flex-col">
      <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="settings" className="text-xs font-medium">
            <Upload className="w-3 h-3 mr-1" />
            Input
          </TabsTrigger>
          <TabsTrigger value="visual" className="text-xs font-medium">
            <Settings className="w-3 h-3 mr-1" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="exhibition" className="text-xs font-medium">
            <Eye className="w-3 h-3 mr-1" />
            Exhibition
          </TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="flex-1 mt-0" forceMount>
          <FeatureOverviewSettings
            atomId={atomId}
            settings={settings}
            onSettingsChange={handleChange}
          />
        </TabsContent>
        <TabsContent value="visual" className="flex-1 mt-0" forceMount>
          <FeatureOverviewVisualisation
            numericColumns={
              Array.isArray(settings.numericColumns)
                ? settings.numericColumns.filter(Boolean)
                : []
            }
            allColumns={
              Array.isArray(settings.allColumns)
                ? settings.allColumns
                    .filter((c: any) => c && c.column)
                    .map((c: any) => c.column)
                : []
            }
            yValues={pendingY}
            xValue={pendingX}
            onYChange={setPendingY}
            onXChange={setPendingX}
            onApply={applyVisual}
          />
        </TabsContent>
        <TabsContent value="exhibition" className="flex-1 mt-0" forceMount>
          <FeatureOverviewExhibition
            atomId={atomId}
            cardId={cardId}
            selections={
              Array.isArray(settings.exhibitionSelections)
                ? settings.exhibitionSelections
                : []
            }
            onRemoveSelection={handleRemoveExhibitionSelection}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default FeatureOverviewProperties;
