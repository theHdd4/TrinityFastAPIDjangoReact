import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Settings } from 'lucide-react';
import FeatureOverviewSettings from '../FeatureOverviewSettings';
import FeatureOverviewVisualisation from '../FeatureOverviewVisualisation';
import { useLaboratoryStore, DEFAULT_FEATURE_OVERVIEW_SETTINGS, FeatureOverviewSettings as SettingsType } from '@/components/LaboratoryMode/store/laboratoryStore';
import { fetchDimensionMapping } from '@/lib/dimensions';

interface Props {
  atomId: string;
}

const FeatureOverviewProperties: React.FC<Props> = ({ atomId }) => {
  const [tab, setTab] = useState('settings');
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const settings: SettingsType = (atom?.settings as SettingsType) || { ...DEFAULT_FEATURE_OVERVIEW_SETTINGS };

  const [pendingY, setPendingY] = useState<string[]>(settings.yAxes || []);
  const [pendingX, setPendingX] = useState<string>(settings.xAxis || 'date');
  const [pendingDimensions, setPendingDimensions] = useState<Record<string, string[]>>(settings.dimensionMap || {});
  const [originalDimensions, setOriginalDimensions] = useState<Record<string, string[]>>({});

  useEffect(() => {
    setPendingY(settings.yAxes || []);
  }, [settings.yAxes]);

  useEffect(() => {
    setPendingX(settings.xAxis || 'date');
  }, [settings.xAxis]);

  useEffect(() => {
    setPendingDimensions(settings.dimensionMap || {});
  }, [settings.dimensionMap]);

  // Fetch original dimension mapping from column classifier
  useEffect(() => {
    const fetchOriginalDimensions = async () => {
      if (!settings.dataSource) return;
      
      try {
        const { mapping: rawMapping } = await fetchDimensionMapping({
          objectName: settings.dataSource,
        });
        if (rawMapping && Object.keys(rawMapping).length > 0) {
          setOriginalDimensions(rawMapping);
        }
      } catch (error) {
        console.warn('Failed to fetch original dimension mapping:', error);
      }
    };

    fetchOriginalDimensions();
  }, [settings.dataSource]);

  const handleChange = (newSettings: Partial<SettingsType>) => {
    updateSettings(atomId, newSettings);
  };

  const applyVisual = () => {
    console.log("🔄 Apply Visual clicked - updating settings");
    console.log("🔄 Pending dimensions:", pendingDimensions);
    console.log("🔄 Pending Y axes:", pendingY);
    console.log("🔄 Pending X axis:", pendingX);
    updateSettings(atomId, { yAxes: pendingY, xAxis: pendingX, dimensionMap: pendingDimensions });
  };

  return (
    <div className="h-full flex flex-col">
      <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="settings" className="text-xs font-medium">
            <Upload className="w-3 h-3 mr-1" />
            Input
          </TabsTrigger>
          <TabsTrigger value="visual" className="text-xs font-medium">
            <Settings className="w-3 h-3 mr-1" />
            Settings
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
            dimensionMap={pendingDimensions}
            originalDimensionMap={originalDimensions}
            onDimensionChange={setPendingDimensions}
            onApply={applyVisual}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default FeatureOverviewProperties;
