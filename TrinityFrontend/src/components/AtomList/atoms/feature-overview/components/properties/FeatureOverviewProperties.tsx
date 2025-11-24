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
  // Initialize originalDimensions from settings.dimensionMap if it has identifiers (includes fallback from canvas)
  const [originalDimensions, setOriginalDimensions] = useState<Record<string, string[]>>(
    (settings.dimensionMap && settings.dimensionMap["identifiers"] && Array.isArray(settings.dimensionMap["identifiers"]) && settings.dimensionMap["identifiers"].length > 0)
      ? settings.dimensionMap
      : {}
  );

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
  // Priority: 1) settings.dimensionMap (includes fallback from canvas), 2) fetch from backend, 3) fallback to categorical columns
  useEffect(() => {
    const fetchOriginalDimensions = async () => {
      if (!settings.dataSource) return;
      
      // Priority 1: Use settings.dimensionMap if it has identifiers (includes fallback from canvas)
      if (settings.dimensionMap && settings.dimensionMap["identifiers"] && Array.isArray(settings.dimensionMap["identifiers"]) && settings.dimensionMap["identifiers"].length > 0) {
        setOriginalDimensions(settings.dimensionMap);
        return;
      }
      
      // Priority 2: Fetch from backend
      try {
        const { mapping: rawMapping } = await fetchDimensionMapping({
          objectName: settings.dataSource,
        });
        if (rawMapping && rawMapping["identifiers"] && Array.isArray(rawMapping["identifiers"]) && rawMapping["identifiers"].length > 0) {
          setOriginalDimensions(rawMapping);
          return;
        }
      } catch (error) {
        // Continue to fallback
      }
      
      // Priority 3: Fallback to categorical columns
      const allCols = Array.isArray(settings.allColumns) && settings.allColumns.length > 0
        ? settings.allColumns
        : Array.isArray(settings.columnSummary)
        ? settings.columnSummary
        : [];
      
      const categoricalColumns = allCols
        .filter((col: any) => {
          const dataType = col?.data_type?.toLowerCase() || '';
          return (dataType === 'object' || dataType === 'category' || dataType === 'string') && col?.column;
        })
        .map((col: any) => col.column)
        .filter(Boolean);
      
      if (categoricalColumns.length > 0) {
        setOriginalDimensions({ identifiers: categoricalColumns });
      }
    };

    fetchOriginalDimensions();
  }, [settings.dataSource, settings.allColumns, settings.columnSummary, settings.dimensionMap]);

  const handleChange = (newSettings: Partial<SettingsType>) => {
    updateSettings(atomId, newSettings);
  };

  const applyVisual = () => {
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
