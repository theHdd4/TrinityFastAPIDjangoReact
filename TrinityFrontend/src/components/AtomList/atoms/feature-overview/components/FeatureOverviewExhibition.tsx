import React, { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Eye, ListChecks, Loader2, Send, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getActiveProjectContext } from '@/utils/projectEnv';
import {
  fetchExhibitionConfiguration,
  saveExhibitionConfiguration,
  type ExhibitionConfigurationPayload,
} from '@/lib/exhibition';
import type { FeatureOverviewExhibitionSelection } from '@/components/LaboratoryMode/store/laboratoryStore';

interface FeatureOverviewExhibitionProps {
  atomId: string;
  cardId?: string | null;
  selections: FeatureOverviewExhibitionSelection[];
  onRemoveSelection?: (key: string) => void;
}

const INITIAL_VISIBILITY = {
  headers: true,
  dataTypes: true,
  uniqueCounts: true,
  sampleValues: false,
  qualityMetrics: false,
};

type VisibilityKey = keyof typeof INITIAL_VISIBILITY;

const formatStatValue = (value: unknown): string => {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return String(value);
    }
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  if (value == null) {
    return '—';
  }

  if (typeof value === 'string') {
    return value.trim() === '' ? '—' : value;
  }

  return String(value);
};

const humanizeLabel = (value?: string | null): string => {
  if (!value) {
    return '';
  }
  return value.replace(/_/g, ' ');
};

const FeatureOverviewExhibition: React.FC<FeatureOverviewExhibitionProps> = ({
  atomId,
  cardId,
  selections,
  onRemoveSelection,
}) => {
  const [visibility, setVisibility] = useState(INITIAL_VISIBILITY);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const selectionCount = selections.length;
  const selectionBadgeLabel = useMemo(() => {
    if (selectionCount === 0) {
      return '0 combinations';
    }
    return selectionCount === 1 ? '1 combination' : `${selectionCount} combinations`;
  }, [selectionCount]);

  const cardIdentifier = cardId || atomId;

  const toggleVisibility = (key: VisibilityKey) => {
    setVisibility(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleExhibit = async () => {
    if (selectionCount === 0) {
      toast({
        title: 'Select combinations to exhibit',
        description: 'Mark checkboxes in the statistical summary to stage combinations here.',
        variant: 'destructive',
      });
      return;
    }

    const context = getActiveProjectContext();
    if (!context || !context.client_name || !context.app_name || !context.project_name) {
      toast({
        title: 'Project details required',
        description: 'Please choose a client, app, and project before exhibiting combinations.',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      let existingConfig: Awaited<ReturnType<typeof fetchExhibitionConfiguration>> | null = null;
      try {
        existingConfig = await fetchExhibitionConfiguration(context);
      } catch (error) {
        console.warn('Unable to fetch existing exhibition configuration', error);
      }

      const existingCards = Array.isArray(existingConfig?.cards) ? existingConfig.cards : [];
      const existingFeatureOverview = Array.isArray(existingConfig?.feature_overview)
        ? existingConfig.feature_overview
        : [];

      const filteredFeatureOverview = existingFeatureOverview.filter(
        entry => entry?.atomId !== atomId,
      );

      const payload: ExhibitionConfigurationPayload = {
        client_name: context.client_name,
        app_name: context.app_name,
        project_name: context.project_name,
        cards: existingCards,
        feature_overview: [
          ...filteredFeatureOverview,
          {
            atomId,
            cardId: cardIdentifier,
            components: {
              skuStatistics: true,
              trendAnalysis: true,
            },
            skus: selections.map((selection, index) => {
              const dimensionSummary = selection.dimensions
                .map(d => d.value)
                .filter(Boolean)
                .join(' / ');
              const title = selection.label ||
                (dimensionSummary ? `${selection.metric} · ${dimensionSummary}` : selection.metric);

              const chartState = selection.chartState ?? {
                chartType: 'line_chart',
                theme: 'default',
                showDataLabels: false,
                showAxisLabels: true,
                xAxisField: selection.featureContext?.xAxis || 'date',
                yAxisField: selection.metric,
              };

              const featureContextDetails = selection.featureContext
                ? {
                    ...selection.featureContext,
                    xAxis: selection.featureContext.xAxis || chartState.xAxisField,
                  }
                : undefined;

              const statisticalDetails = selection.statisticalDetails
                ? {
                    summary: selection.statisticalDetails.summary,
                    timeseries: selection.statisticalDetails.timeseries,
                    full: selection.statisticalDetails.full,
                  }
                : undefined;

              return {
                id: selection.key || `${atomId}-${index}`,
                title,
                details: {
                  metric: selection.metric,
                  combination: selection.combination,
                  dimensions: selection.dimensions,
                  rowId: selection.rowId,
                  label: selection.label,
                  chartState,
                  featureContext: featureContextDetails,
                  statisticalDetails,
                  skuRow: selection.skuRow,
                  capturedAt: selection.capturedAt,
                },
              };
            }),
          },
        ],
      };

      await saveExhibitionConfiguration(payload);
      toast({
        title: 'Exhibition catalogue updated',
        description: 'Your selected combinations are now ready to be exhibited.',
      });
    } catch (error) {
      console.error('Failed to save exhibit catalogue entry', error);
      toast({
        title: 'Unable to exhibit selections',
        description:
          error instanceof Error
            ? error.message
            : 'We could not persist the exhibition configuration right now.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 border border-gray-200 shadow-sm space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <ListChecks className="w-4 h-4 text-blue-500" />
              Selected combinations
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Curate dependent variable and dimension pairings from the statistical summary for exhibition mode.
            </p>
          </div>
          <Badge variant="secondary" className="text-xs font-medium px-2 py-1">
            {selectionBadgeLabel}
          </Badge>
        </div>

        {selectionCount === 0 ? (
          <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
            No combinations selected yet. Use the Exhibition column in the statistical summary to stage combinations here.
          </div>
        ) : (
          <div className="space-y-3">
            {selections.map(selection => {
              const summary = (selection.statisticalDetails?.summary ?? null) as
                | Record<string, any>
                | null;
              const summaryPairs = summary
                ? Object.entries(summary).filter(([, value]) =>
                    value !== undefined && value !== null && typeof value !== 'object',
                  )
                : [];
              const chartState = selection.chartState;
              const featureContext = selection.featureContext;

              return (
                <div
                  key={selection.key}
                  className="rounded-md border border-gray-200 bg-white/80 px-3 py-3 shadow-sm flex flex-col gap-3"
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-gray-900">
                        {selection.label || selection.metric}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {selection.dimensions.map(dimension => (
                          <Badge key={`${selection.key}-${dimension.name}`} variant="outline" className="text-[11px]">
                            {dimension.name}: {dimension.value || '—'}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    {onRemoveSelection && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="ml-auto text-gray-500 hover:text-gray-700"
                        onClick={() => onRemoveSelection(selection.key)}
                      >
                        <X className="h-4 w-4" />
                        <span className="sr-only">Remove selection</span>
                      </Button>
                    )}
                  </div>

                  {summaryPairs.length > 0 && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                      {summaryPairs.map(([key, value]) => (
                        <span key={key} className="font-medium">
                          {humanizeLabel(key)}:{' '}
                          <span className="font-normal">{formatStatValue(value)}</span>
                        </span>
                      ))}
                    </div>
                  )}

                  {chartState && (
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] uppercase tracking-wide text-gray-500">
                      <span>Type: {humanizeLabel(chartState.chartType)}</span>
                      <span>Theme: {humanizeLabel(chartState.theme)}</span>
                      <span>Labels: {chartState.showDataLabels ? 'On' : 'Off'}</span>
                      <span>Axis Labels: {chartState.showAxisLabels ? 'On' : 'Off'}</span>
                      <span>X: {humanizeLabel(chartState.xAxisField)}</span>
                      <span>Y: {humanizeLabel(chartState.yAxisField)}</span>
                    </div>
                  )}

                  {featureContext && (
                    <div className="text-[11px] text-gray-400 flex flex-wrap gap-x-3 gap-y-1">
                      {featureContext.dataSource && <span>Data: {featureContext.dataSource}</span>}
                      {featureContext.xAxis && <span>X axis: {featureContext.xAxis}</span>}
                      {Array.isArray(featureContext.availableMetrics) && featureContext.availableMetrics.length > 0 && (
                        <span>Y axes: {featureContext.availableMetrics.join(', ')}</span>
                      )}
                    </div>
                  )}

                  {selection.capturedAt && (
                    <div className="text-[10px] text-gray-400">
                      Captured at {new Date(selection.capturedAt).toLocaleString()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="p-4 border border-gray-200 shadow-sm">
        <div className="flex items-center space-x-2 mb-4">
          <Eye className="w-4 h-4 text-green-500" />
          <h4 className="font-medium text-gray-900">Visibility Settings</h4>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Show column headers</span>
            <input
              type="checkbox"
              className="rounded border-gray-300"
              checked={visibility.headers}
              onChange={() => toggleVisibility('headers')}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Display data types</span>
            <input
              type="checkbox"
              className="rounded border-gray-300"
              checked={visibility.dataTypes}
              onChange={() => toggleVisibility('dataTypes')}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Show unique counts</span>
            <input
              type="checkbox"
              className="rounded border-gray-300"
              checked={visibility.uniqueCounts}
              onChange={() => toggleVisibility('uniqueCounts')}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Include sample values</span>
            <input
              type="checkbox"
              className="rounded border-gray-300"
              checked={visibility.sampleValues}
              onChange={() => toggleVisibility('sampleValues')}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Show data quality metrics</span>
            <input
              type="checkbox"
              className="rounded border-gray-300"
              checked={visibility.qualityMetrics}
              onChange={() => toggleVisibility('qualityMetrics')}
            />
          </div>
        </div>
      </Card>

      <div className="space-y-2">
        <Button
          type="button"
          className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white"
          size="lg"
          onClick={handleExhibit}
          disabled={isSaving || selectionCount === 0}
        >
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Send className="mr-2 h-4 w-4" />
              Exhibit
            </>
          )}
        </Button>
        {selectionCount === 0 && (
          <p className="text-xs text-gray-500 text-center">
            Select at least one combination from the statistical summary to enable the Exhibit action.
          </p>
        )}
      </div>
    </div>
  );
};

export default FeatureOverviewExhibition;
