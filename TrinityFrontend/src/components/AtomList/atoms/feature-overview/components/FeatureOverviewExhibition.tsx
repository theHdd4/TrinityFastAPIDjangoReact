import React, { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ListChecks, Loader2, PencilLine, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getActiveProjectContext } from '@/utils/projectEnv';
import {
  fetchExhibitionConfiguration,
  saveExhibitionConfiguration,
  type ExhibitionAtomPayload,
  type ExhibitionComponentPayload,
  type ExhibitionConfigurationPayload,
} from '@/lib/exhibition';
import type {
  FeatureOverviewExhibitionComponentType,
  FeatureOverviewExhibitionSelection,
  FeatureOverviewExhibitionSelectionDimension,
} from '@/components/LaboratoryMode/store/laboratoryStore';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { useExhibitionStore } from '@/components/ExhibitionMode/store/exhibitionStore';
import {
  buildChartRendererPropsFromManifest,
  buildTableDataFromManifest,
  clonePlain,
} from '@/components/AtomList/atoms/feature-overview/utils/exhibitionManifest';
import { resolvePalette } from '@/components/AtomList/atoms/feature-overview/utils/colorPalettes';

interface FeatureOverviewExhibitionProps {
  atomId: string;
  cardId?: string | null;
  selections: FeatureOverviewExhibitionSelection[];
  onRemoveSelection?: (key: string) => void;
  onRenameSelection?: (key: string, name: string) => void;
}

const sanitizeSegment = (value?: string | null): string => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
};

const buildBaseDescriptor = (selection: FeatureOverviewExhibitionSelection): string => {
  const dimensionSegments = Array.isArray(selection.dimensions)
    ? selection.dimensions
        .map((dimension: FeatureOverviewExhibitionSelectionDimension) =>
          sanitizeSegment(dimension.value) || sanitizeSegment(dimension.name),
        )
        .filter(Boolean)
    : [];

  const yAxisSegment =
    sanitizeSegment(selection.chartState?.yAxisLabel) ||
    sanitizeSegment(selection.chartState?.yAxisField) ||
    sanitizeSegment(selection.metric);

  const segments = [...dimensionSegments, yAxisSegment].filter(Boolean);

  return segments.join(' - ');
};

const buildDefaultEditableName = (selection: FeatureOverviewExhibitionSelection): string => {
  const baseDescriptor = buildBaseDescriptor(selection);
  return baseDescriptor ? `The component details: ${baseDescriptor}` : 'The component details';
};

const FeatureOverviewExhibition: React.FC<FeatureOverviewExhibitionProps> = ({
  atomId,
  cardId,
  selections,
  onRemoveSelection: _onRemoveSelection,
  onRenameSelection,
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draftNames, setDraftNames] = useState<Record<string, string>>({});
  const { toast } = useToast();
  const loadSavedConfiguration = useExhibitionStore(state => state.loadSavedConfiguration);

  const selectionCount = selections.length;
  const selectionBadgeLabel = useMemo(() => {
    if (selectionCount === 0) {
      return '0 components';
    }
    return selectionCount === 1 ? '1 component' : `${selectionCount} components`;
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

      const existingAtoms = Array.isArray(existingConfig?.atoms) ? existingConfig.atoms : [];
      const retainedAtoms = existingAtoms.filter((entry): entry is ExhibitionAtomPayload => {
        if (!entry || typeof entry !== 'object') {
          return false;
        }

        const identifier = typeof entry.id === 'string' && entry.id.trim().length > 0 ? entry.id.trim() : '';
        const atomName = typeof entry.atom_name === 'string' && entry.atom_name.trim().length > 0 ? entry.atom_name.trim() : '';
        if (!identifier || !atomName) {
          return false;
        }

        return identifier !== cardIdentifier;
      });

      const processedSelections = selections.map((selection, index) => {
        const componentType: FeatureOverviewExhibitionComponentType =
          selection.componentType ?? 'statistical_summary';
        const dimensionSummary = selection.dimensions
          .map(d => d.value)
          .filter(Boolean)
          .join(' / ');
        const title = selection.label || (dimensionSummary ? `${selection.metric} · ${dimensionSummary}` : selection.metric);

        const manifest = selection.visualizationManifest
          ? clonePlain(selection.visualizationManifest)
          : undefined;
        const manifestId = selection.manifestId || manifest?.id || selection.key;
        const manifestChartProps = buildChartRendererPropsFromManifest(manifest);
        const manifestTableData = buildTableDataFromManifest(manifest);

        const baseChartState = selection.chartState;
        const fallbackTheme = baseChartState?.theme || 'default';
        const fallbackXAxis = selection.featureContext?.xAxis || baseChartState?.xAxisField || 'date';
        const fallbackYAxis = baseChartState?.yAxisField || selection.metric;
        const featureContextDetails = selection.featureContext
          ? {
              ...selection.featureContext,
              xAxis: selection.featureContext.xAxis || fallbackXAxis,
            }
          : undefined;

        const normalisedChartState =
          componentType === 'trend_analysis'
            ? {
                chartType: baseChartState?.chartType || 'line_chart',
                theme: fallbackTheme,
                showDataLabels: baseChartState?.showDataLabels ?? false,
                showAxisLabels: baseChartState?.showAxisLabels ?? true,
                showGrid: baseChartState?.showGrid ?? true,
                showLegend: baseChartState?.showLegend ?? true,
                xAxisField: fallbackXAxis,
                yAxisField: fallbackYAxis,
                colorPalette: resolvePalette(fallbackTheme, baseChartState?.colorPalette),
                legendField: baseChartState?.legendField,
                xAxisLabel:
                  baseChartState?.xAxisLabel || featureContextDetails?.xAxis || fallbackXAxis,
                yAxisLabel: baseChartState?.yAxisLabel || fallbackYAxis,
                sortOrder:
                  baseChartState?.sortOrder === 'asc' || baseChartState?.sortOrder === 'desc'
                    ? baseChartState.sortOrder
                    : null,
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
          id: selection.key || `${atomId}-${index}-${componentType}`,
          title,
          chartState: componentType === 'trend_analysis' ? normalisedChartState : undefined,
          featureContext: featureContextDetails,
          statisticalDetails,
          selection,
          componentType,
          sourceAtomTitle: resolvedAtomTitle,
          manifest,
          manifestId,
          manifestChartProps,
          manifestTableData,
        };
      });

      const stagedRows = processedSelections
        .map(item => item.selection.skuRow)
        .filter((row): row is Record<string, any> => row != null && typeof row === 'object');

      const skuStatisticsSettings: {
        visibility: Record<string, boolean>;
        tableRows?: Record<string, any>[];
        tableColumns?: string[];
      } = {
        visibility: { ...visibility },
      };

      if (stagedRows.length > 0) {
        skuStatisticsSettings.tableRows = stagedRows;
        skuStatisticsSettings.tableColumns = Array.from(
          new Set(stagedRows.flatMap(row => Object.keys(row))),
        );
      }

      const exhibitedComponents: ExhibitionComponentPayload[] = processedSelections.flatMap(
        ({
          id,
          title,
          chartState: normalisedChartState,
          featureContext,
          statisticalDetails,
          selection: baseSelection,
          componentType,
          sourceAtomTitle: originatingAtomTitle,
          manifest,
          manifestId,
          manifestChartProps,
          manifestTableData,
        }) => {
          const baseMetadata = {
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
            skuStatisticsSettings: {
              visibility: { ...skuStatisticsSettings.visibility },
              tableRows: skuStatisticsSettings.tableRows?.map(row => ({ ...row })),
              tableColumns: skuStatisticsSettings.tableColumns
                ? [...skuStatisticsSettings.tableColumns]
                : undefined,
            },
          };

          if (manifest) {
            baseMetadata.visualizationManifest = manifest;
          }

          if (manifestId) {
            baseMetadata.manifestId = manifestId;
          }

          if (manifestChartProps) {
            baseMetadata.chartRendererProps = clonePlain(manifestChartProps);
            baseMetadata.chartData = clonePlain(manifestChartProps.data);
          } else if (manifest?.data?.timeseries) {
            baseMetadata.chartData = clonePlain(manifest.data.timeseries);
          }

          if (manifestTableData) {
            baseMetadata.tableData = manifestTableData;
          } else if (manifest?.table?.rows && manifest.table.rows.length > 0) {
            baseMetadata.tableData = {
              headers:
                manifest.table.columns && manifest.table.columns.length > 0
                  ? [...manifest.table.columns]
                  : Object.keys(manifest.table.rows[0] ?? {}),
              rows: manifest.table.rows.map(row => ({ ...row })),
            };
          }

          const componentLabel =
            componentType === 'trend_analysis' ? 'Trend Analysis' : 'Statistical Summary';

          return [
            {
              id,
              atomId,
              title: `${title} · ${componentLabel}`,
              category: 'Feature Overview',
              color: 'bg-amber-500',
              metadata: {
                ...baseMetadata,
                chartState: componentType === 'trend_analysis' ? normalisedChartState : undefined,
                viewType:
                  componentType === 'trend_analysis'
                    ? ('trend_analysis' as const)
                    : ('statistical_summary' as const),
              },
              manifest,
              manifest_id: manifestId,
            },
          ];
        },
      );

      const newEntry: ExhibitionAtomPayload = {
        id: cardIdentifier,
        atom_name: resolvedAtomTitle,
        exhibited_components: exhibitedComponents,
      };

      const payload: ExhibitionConfigurationPayload = {
        client_name: context.client_name,
        app_name: context.app_name,
        project_name: context.project_name,
        atoms: [...retainedAtoms, newEntry],
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
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <ListChecks className="w-4 h-4 text-blue-500" />
            Selected components
          </div>
          <Badge variant="secondary" className="text-xs font-medium px-2 py-1">
            {selectionBadgeLabel}
          </Badge>
        </div>

        {selectionCount === 0 ? (
          <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
            No components have been staged for exhibition yet. Mark feature overview insights for exhibition to see them here.
          </div>
        ) : (
          <div className="space-y-3">
            {selections.map(selection => {
              const defaultEditableName = buildDefaultEditableName(selection);
              const currentEditableName = sanitizeSegment(selection.label) || defaultEditableName;
              const baseDescriptor = buildBaseDescriptor(selection);
              const actualName = baseDescriptor || 'Not specified';
              const isEditing = editingKey === selection.key;
              const draftValue = draftNames[selection.key] ?? currentEditableName;

              const startEditing = () => {
                setDraftNames(prev => ({ ...prev, [selection.key]: currentEditableName }));
                setEditingKey(selection.key);
              };

              const updateDraft = (value: string) => {
                setDraftNames(prev => ({ ...prev, [selection.key]: value }));
              };

              const finishEditing = (shouldSave: boolean) => {
                setEditingKey(null);
                setDraftNames(prev => {
                  const { [selection.key]: _discarded, ...rest } = prev;
                  return rest;
                });

                if (!shouldSave || !onRenameSelection) {
                  return;
                }

                const proposedName = draftValue.trim();
                const nextName = proposedName.length > 0 ? proposedName : defaultEditableName;
                onRenameSelection(selection.key, nextName);
              };

              return (
                <div
                  key={selection.key}
                  className="rounded-lg border border-gray-200 bg-white/80 px-3 py-3 shadow-sm space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    {isEditing ? (
                      <Input
                        value={draftValue}
                        onChange={event => updateDraft(event.target.value)}
                        onBlur={() => finishEditing(true)}
                        onKeyDown={event => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            finishEditing(true);
                          }
                          if (event.key === 'Escape') {
                            event.preventDefault();
                            finishEditing(false);
                          }
                        }}
                        autoFocus
                        className="text-sm font-semibold text-emerald-700 focus-visible:ring-emerald-500"
                      />
                    ) : (
                      <span className="text-sm font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md">
                        {currentEditableName}
                      </span>
                    )}

                    {!isEditing && onRenameSelection && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-gray-500 hover:text-gray-700"
                        onClick={startEditing}
                      >
                        <PencilLine className="h-4 w-4" />
                        <span className="sr-only">Rename component</span>
                      </Button>
                    )}
                  </div>

                  <p className="text-xs text-gray-600 font-medium">{actualName}</p>
                </div>
              );
            })}
          </div>
        )}
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
