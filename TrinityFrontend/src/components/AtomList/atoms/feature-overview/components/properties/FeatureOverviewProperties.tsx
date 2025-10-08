import React, { useState, useEffect, useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Settings, Eye } from 'lucide-react';
import FeatureOverviewSettings from '../FeatureOverviewSettings';
import FeatureOverviewVisualisation from '../FeatureOverviewVisualisation';
import FeatureOverviewExhibition from '../FeatureOverviewExhibition';
import { useLaboratoryStore, DEFAULT_FEATURE_OVERVIEW_SETTINGS, FeatureOverviewSettings as SettingsType } from '@/components/LaboratoryMode/store/laboratoryStore';
import { useToast } from '@/hooks/use-toast';
import {
  ExhibitionFeatureOverviewPayload,
  fetchExhibitionConfiguration,
  saveExhibitionConfiguration,
} from '@/lib/exhibition';
import { sanitizeCards } from '@/utils/projectStorage';
import { getActiveProjectContext } from '@/utils/projectEnv';
import { useExhibitionStore } from '@/components/ExhibitionMode/store/exhibitionStore';

interface Props {
  atomId: string;
}

const FeatureOverviewProperties: React.FC<Props> = ({ atomId }) => {
  const [tab, setTab] = useState('settings');
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const cards = useLaboratoryStore(state => state.cards);
  const settings: SettingsType = (atom?.settings as SettingsType) || { ...DEFAULT_FEATURE_OVERVIEW_SETTINGS };
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const parentCard = useMemo(() => cards.find(card => card.atoms.some(atom => atom.id === atomId)), [cards, atomId]);

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

  const handleComponentSelectionChange = (components: SettingsType['exhibitionComponents']) => {
    updateSettings(atomId, { exhibitionComponents: components });
  };

  const handleSelectionRemove = (key: string) => {
    if (!key) {
      return;
    }
    const next = { ...(settings.exhibitionMetrics || {}) };
    if (key in next) {
      delete next[key];
      updateSettings(atomId, { exhibitionMetrics: next });
    }
  };

  const handleExhibit = async () => {
    if (isSubmitting) {
      return;
    }

    const context = getActiveProjectContext();
    if (!context) {
      toast({ title: 'Missing project context', description: 'Select a client, app, and project before exhibiting.', variant: 'destructive' });
      return;
    }

    if (!parentCard) {
      toast({ title: 'Card not found', description: 'Unable to locate the card for this atom.', variant: 'destructive' });
      return;
    }

    const metricSelections = settings.exhibitionMetrics
      ? Object.values(settings.exhibitionMetrics)
      : [];

    if (metricSelections.length === 0) {
      toast({ title: 'No metrics selected', description: 'Toggle the Exhibit switch for at least one metric before exhibiting.' });
      return;
    }

    const components = settings.exhibitionComponents ?? { skuStatistics: false, trendAnalysis: false };

    const grouped = new Map<string, {
      id: string;
      title: string;
      details?: Record<string, any>;
      statistical_summaries: any[];
    }>();

    metricSelections.forEach(selection => {
      if (!selection || !selection.skuId || !selection.metric) {
        return;
      }

      const skuId = String(selection.skuId);
      const existing = grouped.get(skuId) ?? {
        id: skuId,
        title: selection.skuTitle || skuId,
        details: typeof selection.skuDetails === 'object' && selection.skuDetails !== null
          ? selection.skuDetails as Record<string, any>
          : undefined,
        statistical_summaries: [],
      };

      const chartSettings = selection.chartSettings ?? {
        chartType: 'line_chart',
        chartTheme: 'default',
        showDataLabels: false,
        showAxisLabels: true,
        xAxisLabel: settings.xAxis || 'Date',
        yAxisLabel: selection.metric,
      };

      existing.statistical_summaries.push({
        metric: selection.metric,
        metric_label: selection.metricLabel || selection.metric,
        summary: selection.summary ?? {},
        timeseries: Array.isArray(selection.timeseries) ? selection.timeseries : [],
        chart_settings: {
          chart_type: chartSettings.chartType,
          chart_theme: chartSettings.chartTheme,
          show_data_labels: Boolean(chartSettings.showDataLabels),
          show_axis_labels: Boolean(chartSettings.showAxisLabels),
          x_axis_label: chartSettings.xAxisLabel ?? settings.xAxis ?? 'Date',
          y_axis_label: chartSettings.yAxisLabel ?? selection.metric,
        },
        combination: selection.combination ?? {},
        component_type: selection.componentType ?? 'statistical_summary',
      });

      grouped.set(skuId, existing);
    });

    const skuPayload = Array.from(grouped.values());

    const sanitizedCards = sanitizeCards(cards);

    let mergedFeatureOverview: ExhibitionFeatureOverviewPayload[] = [];

    try {
      const existing = await fetchExhibitionConfiguration(context);
      if (existing?.feature_overview) {
        mergedFeatureOverview = existing.feature_overview.filter(entry => entry.cardId !== parentCard.id);
      }
    } catch (error) {
      console.warn('Unable to load existing exhibition configuration for merge', error);
    }

    const payload = {
      ...context,
      cards: sanitizedCards,
      feature_overview: [
        ...mergedFeatureOverview,
        {
          atomId,
          cardId: parentCard.id,
          components,
          skus: skuPayload,
        },
      ],
    };

    setIsSubmitting(true);
      try {
        await saveExhibitionConfiguration(payload);
        await useExhibitionStore.getState().loadSavedConfiguration();
        toast({ title: 'Exhibition updated', description: 'Selected metrics have been prepared for exhibition.' });
    } catch (error: any) {
      toast({ title: 'Failed to exhibit', description: error?.message || 'Unable to update exhibition configuration.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

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
            settings={settings}
            onComponentsChange={handleComponentSelectionChange}
            onExhibit={handleExhibit}
            isSubmitting={isSubmitting}
            onSelectionRemove={handleSelectionRemove}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default FeatureOverviewProperties;
