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

    const selectedSkus = Array.isArray(settings.exhibitionSkus) ? settings.exhibitionSkus.map(String) : [];
    if (selectedSkus.length === 0) {
      toast({ title: 'No SKUs selected', description: 'Pick at least one SKU from the table before exhibiting.' });
      return;
    }

    const components = settings.exhibitionComponents ?? { skuStatistics: false, trendAnalysis: false };
    const tableRows = Array.isArray(settings.skuTable) ? settings.skuTable : [];

    const skuPayload = selectedSkus.map((skuId, index) => {
      const match = tableRows.find(row => String(row?.id ?? row?.SKU ?? row?.sku) === skuId) || tableRows.find(row => String(row?.id) === skuId);
      const titleCandidate =
        (match && (match.SKU_NAME || match.sku_name || match.SKU || match.sku || match.name || match.product_name)) ||
        skuId;

      return {
        id: skuId,
        title: String(titleCandidate),
        details: match,
      };
    });

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
      toast({ title: 'Exhibition updated', description: 'Selected SKUs have been prepared for exhibition.' });
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
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default FeatureOverviewProperties;
