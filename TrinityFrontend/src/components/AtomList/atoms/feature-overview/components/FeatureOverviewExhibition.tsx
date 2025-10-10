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
  type ExhibitionFeatureOverviewPayload,
} from '@/lib/exhibition';
import type { FeatureOverviewExhibitionSelection } from '@/components/LaboratoryMode/store/laboratoryStore';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { useExhibitionStore } from '@/components/ExhibitionMode/store/exhibitionStore';

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

const THEME_COLOR_MAP: Record<string, string[]> = {
  default: ['#6366f1', '#a5b4fc', '#e0e7ff', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'],
  blue: ['#1e40af', '#3b82f6', '#60a5fa', '#93c5fd', '#dbeafe', '#eff6ff'],
  green: ['#065f46', '#10b981', '#6ee7b7', '#a7f3d0', '#d1fae5', '#ecfdf5'],
  purple: ['#581c87', '#8b5cf6', '#c4b5fd', '#ddd6fe', '#ede9fe', '#faf5ff'],
  orange: ['#92400e', '#f59e0b', '#fcd34d', '#fde68a', '#fef3c7', '#fffbeb'],
  red: ['#991b1b', '#ef4444', '#f87171', '#fca5a5', '#fecaca', '#fef2f2'],
  teal: ['#134e4a', '#14b8a6', '#5eead4', '#99f6e4', '#ccfbf1', '#f0fdfa'],
  pink: ['#831843', '#ec4899', '#f9a8d4', '#fbcfe8', '#fce7f3', '#fdf2f8'],
  gray: ['#374151', '#6b7280', '#9ca3af', '#d1d5db', '#f3f4f6', '#f9fafb'],
  indigo: ['#312e81', '#4f46e5', '#818cf8', '#a5b4fc', '#e0e7ff', '#eef2ff'],
  cyan: ['#164e63', '#06b6d4', '#67e8f9', '#a5f3fc', '#cffafe', '#ecfeff'],
  lime: ['#3f6212', '#84cc16', '#bef264', '#d9f99d', '#f7fee7', '#f7fee7'],
  amber: ['#78350f', '#f59e0b', '#fbbf24', '#fcd34d', '#fef3c7', '#fffbeb'],
  emerald: ['#064e3b', '#059669', '#34d399', '#6ee7b7', '#d1fae5', '#ecfdf5'],
  violet: ['#4c1d95', '#7c3aed', '#a78bfa', '#c4b5fd', '#ede9fe', '#faf5ff'],
  fuchsia: ['#701a75', '#d946ef', '#f0abfc', '#f5d0fe', '#fae8ff', '#fdf4ff'],
  rose: ['#881337', '#e11d48', '#fb7185', '#fda4af', '#ffe4e6', '#fff1f2'],
  slate: ['#1e293b', '#475569', '#94a3b8', '#cbd5e1', '#f1f5f9', '#f8fafc'],
  zinc: ['#27272a', '#71717a', '#a1a1aa', '#d4d4d8', '#f4f4f5', '#fafafa'],
  neutral: ['#262626', '#737373', '#a3a3a3', '#d4d4d4', '#f5f5f5', '#fafafa'],
  stone: ['#292524', '#78716c', '#a8a29e', '#d6d3d1', '#f5f5f4', '#fafaf9'],
};

const resolvePalette = (theme?: string, provided?: string[]): string[] | undefined => {
  if (Array.isArray(provided) && provided.length > 0) {
    return provided;
  }
  if (theme && THEME_COLOR_MAP[theme]) {
    return THEME_COLOR_MAP[theme];
  }
  return undefined;
};

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
  const loadSavedConfiguration = useExhibitionStore(state => state.loadSavedConfiguration);

  const selectionCount = selections.length;
  const selectionBadgeLabel = useMemo(() => {
    if (selectionCount === 0) {
      return '0 combinations';
    }
    return selectionCount === 1 ? '1 combination' : `${selectionCount} combinations`;
  }, [selectionCount]);

  const cardIdentifier = cardId || atomId;
  const sourceAtomTitle = useLaboratoryStore(state => {
    const card = state.cards.find(entry => entry.id === cardIdentifier);
    if (!card) {
      return '';
    }

    if (typeof card.moleculeTitle === 'string' && card.moleculeTitle.trim().length > 0) {
      return card.moleculeTitle.trim();
    }

    if (Array.isArray(card.atoms) && card.atoms.length > 0) {
      const fallback = card.atoms.find(atom => typeof atom.title === 'string' && atom.title.trim().length > 0);
      if (fallback) {
        return fallback.title.trim();
      }
    }

    return '';
  });
  const resolvedAtomTitle = useMemo(() => {
    if (sourceAtomTitle && sourceAtomTitle.trim().length > 0) {
      return sourceAtomTitle.trim();
    }

    const humanisedFromId = atomId
      .split(/[-_]/g)
      .filter(Boolean)
      .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(' ');

    if (humanisedFromId.trim().length > 0) {
      return humanisedFromId;
    }

    return 'Exhibited Atom';
  }, [atomId, sourceAtomTitle]);

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
    const { client_name, app_name, project_name } = context;

    console.info(
      `[Exhibition] Accessing exhibition_catalogue collection in trinity_db for project ${client_name}/${app_name}/${project_name}`,
    );
    try {
      let existingConfig: Awaited<ReturnType<typeof fetchExhibitionConfiguration>> | null = null;
      try {
        existingConfig = await fetchExhibitionConfiguration(context);
        if (existingConfig) {
          console.info(
            `[Exhibition] exhibition_catalogue collection found for project ${client_name}/${app_name}/${project_name}`,
          );
        } else {
          console.info(
            `[Exhibition] exhibition_catalogue collection not found for project ${client_name}/${app_name}/${project_name}. Creating a new entry in trinity_db.`,
          );
        }
      } catch (error) {
        console.warn('Unable to fetch existing exhibition configuration', error);
        console.info(
          `[Exhibition] Proceeding to create exhibition_catalogue entry for project ${client_name}/${app_name}/${project_name}`,
        );
      }

      const existingCards = Array.isArray(existingConfig?.cards) ? existingConfig.cards : [];
      const existingFeatureOverview = Array.isArray(existingConfig?.feature_overview)
        ? existingConfig.feature_overview
        : [];

      const filteredFeatureOverview = existingFeatureOverview.filter(
        entry => entry?.atomId !== atomId,
      );

      const processedSelections = selections.map((selection, index) => {
        const dimensionSummary = selection.dimensions
          .map(d => d.value)
          .filter(Boolean)
          .join(' / ');
        const title = selection.label || (dimensionSummary ? `${selection.metric} · ${dimensionSummary}` : selection.metric);

        const baseChartState = selection.chartState;
        const fallbackTheme = baseChartState?.theme || 'default';
        const fallbackXAxis = baseChartState?.xAxisField || selection.featureContext?.xAxis || 'date';
        const fallbackYAxis = baseChartState?.yAxisField || selection.metric;
        const normalisedChartState = {
          chartType: baseChartState?.chartType || 'line_chart',
          theme: fallbackTheme,
          showDataLabels: baseChartState?.showDataLabels ?? false,
          showAxisLabels: baseChartState?.showAxisLabels ?? true,
          showGrid: baseChartState?.showGrid ?? true,
          showLegend: baseChartState?.showLegend ?? true,
          xAxisField: fallbackXAxis,
          yAxisField: fallbackYAxis,
          colorPalette: resolvePalette(fallbackTheme, baseChartState?.colorPalette),
        };

        const featureContextDetails = selection.featureContext
          ? {
              ...selection.featureContext,
              xAxis: selection.featureContext.xAxis || normalisedChartState.xAxisField,
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
          chartState: normalisedChartState,
          featureContext: featureContextDetails,
          statisticalDetails,
          selection,
          sourceAtomTitle: resolvedAtomTitle,
        };
      });

      const chartSettings = processedSelections[0]?.chartState;
      const stagedRows = processedSelections
        .map(item => item.selection.skuRow)
        .filter((row): row is Record<string, any> => row != null && typeof row === 'object');

      const skuStatisticsSettings = {
        visibility: { ...visibility },
      } as ExhibitionFeatureOverviewPayload['skuStatisticsSettings'];

      if (stagedRows.length > 0) {
        skuStatisticsSettings.tableRows = stagedRows;
        skuStatisticsSettings.tableColumns = Array.from(
          new Set(stagedRows.flatMap(row => Object.keys(row))),
        );
      }

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
            skus: processedSelections.map(({
              id,
              title,
              chartState: normalisedChartState,
              featureContext,
              statisticalDetails,
              selection: baseSelection,
              sourceAtomTitle: originatingAtomTitle,
            }) => ({
              id,
              title,
              details: {
                metric: baseSelection.metric,
                combination: baseSelection.combination,
                dimensions: baseSelection.dimensions,
                rowId: baseSelection.rowId,
                label: baseSelection.label,
                chartState: normalisedChartState,
                featureContext,
                statisticalDetails,
                skuRow: baseSelection.skuRow,
                capturedAt: baseSelection.capturedAt,
                sourceAtomTitle: originatingAtomTitle,
              },
            })),
            chartSettings,
            skuStatisticsSettings,
          },
        ],
      };

      await saveExhibitionConfiguration(payload);
      await loadSavedConfiguration(context);
      console.info(
        `[Exhibition] exhibition_catalogue collection successfully updated for project ${client_name}/${app_name}/${project_name} with ${selections.length} exhibited combination(s)`,
      );
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
