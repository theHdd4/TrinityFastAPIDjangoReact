import React, { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ChevronDown, Image, ListChecks, Loader2, PencilLine, Send, Settings2 } from 'lucide-react';
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
import ExhibitionFeatureOverview from '@/components/ExhibitionMode/components/atoms/FeatureOverview';
import {
  buildChartRendererPropsFromManifest,
  buildTableDataFromManifest,
  clonePlain,
} from '@/components/AtomList/atoms/feature-overview/utils/exhibitionManifest';
import { resolvePalette } from '@/components/AtomList/atoms/feature-overview/utils/colorPalettes';

interface FeatureOverviewExhibitionProps {
  atomId: string;
  cardId?: string | null;
  atomColor?: string | null;
  selections: FeatureOverviewExhibitionSelection[];
  onRemoveSelection?: (key: string) => void;
  onRenameSelection?: (key: string, name: string) => void;
}

type VisibilityToggleKey =
  | 'headers'
  | 'dataTypes'
  | 'uniqueCounts'
  | 'sampleValues'
  | 'qualityMetrics';

const DEFAULT_VISIBILITY: Record<VisibilityToggleKey, boolean> = {
  headers: true,
  dataTypes: true,
  uniqueCounts: true,
  sampleValues: true,
  qualityMetrics: true,
};

const VISIBILITY_TOGGLES: Array<{ key: VisibilityToggleKey; label: string }> = [
  { key: 'headers', label: 'Show column headers' },
  { key: 'dataTypes', label: 'Display data types' },
  { key: 'uniqueCounts', label: 'Show unique counts' },
  { key: 'sampleValues', label: 'Include sample values' },
  { key: 'qualityMetrics', label: 'Show data quality metrics' },
];

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

const getComponentPrefix = (componentType?: FeatureOverviewExhibitionComponentType): string =>
  componentType === 'trend_analysis' ? 'Trend Analysis' : 'SKU Stats';

interface ProcessedSelection {
  id: string;
  title: string;
  componentType: FeatureOverviewExhibitionComponentType;
  metadata: Record<string, unknown>;
  manifest?: unknown;
  manifestId?: string;
}

interface NormaliseSelectionOptions {
  selection: FeatureOverviewExhibitionSelection;
  index: number;
  atomId: string;
  resolvedAtomTitle: string;
  visibility: Record<VisibilityToggleKey, boolean>;
  stagedRows: Array<Record<string, any>>;
  stagedColumns: string[];
}

const normaliseSelectionForExhibition = ({
  selection,
  index,
  atomId,
  resolvedAtomTitle,
  visibility,
  stagedRows,
  stagedColumns,
}: NormaliseSelectionOptions): ProcessedSelection => {
  const componentType: FeatureOverviewExhibitionComponentType = selection.componentType ?? 'statistical_summary';

  const manifest = selection.visualizationManifest ? clonePlain(selection.visualizationManifest) : undefined;
  const manifestId =
    selection.manifestId ||
    (manifest && typeof manifest === 'object' && 'id' in manifest ? (manifest as Record<string, any>).id : undefined) ||
    selection.key;
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
          xAxisLabel: baseChartState?.xAxisLabel || featureContextDetails?.xAxis || fallbackXAxis,
          yAxisLabel: baseChartState?.yAxisLabel || fallbackYAxis,
          sortOrder:
            baseChartState?.sortOrder === 'asc' || baseChartState?.sortOrder === 'desc'
              ? baseChartState.sortOrder
              : null,
        }
      : undefined;

  const statisticalDetails = selection.statisticalDetails
    ? {
        summary: clonePlain(selection.statisticalDetails.summary),
        timeseries: clonePlain(selection.statisticalDetails.timeseries),
        full: clonePlain(selection.statisticalDetails.full),
      }
    : undefined;

  const metadata: Record<string, unknown> = {
    metric: selection.metric,
    combination: clonePlain(selection.combination),
    dimensions: Array.isArray(selection.dimensions)
      ? selection.dimensions.map(dimension => ({ ...dimension }))
      : undefined,
    rowId: selection.rowId,
    label: selection.label,
    chartState: normalisedChartState,
    featureContext: featureContextDetails ? { ...featureContextDetails } : undefined,
    statisticalDetails,
    skuRow: selection.skuRow ? { ...selection.skuRow } : undefined,
    capturedAt: selection.capturedAt,
    sourceAtomTitle: resolvedAtomTitle,
    skuStatisticsSettings: {
      visibility: { ...visibility },
      tableRows: stagedRows.map(row => ({ ...row })),
      tableColumns: stagedColumns.length > 0 ? [...stagedColumns] : undefined,
    },
    viewType: componentType === 'trend_analysis' ? 'trend_analysis' : 'statistical_summary',
  };

  if (manifest) {
    metadata.visualizationManifest = manifest;
  }

  if (manifestId) {
    metadata.manifestId = manifestId;
  }

  if (manifestChartProps) {
    metadata.chartRendererProps = clonePlain(manifestChartProps);
    metadata.chartData = clonePlain(manifestChartProps.data);
  } else if (manifest && typeof manifest === 'object' && 'data' in manifest && manifest.data?.timeseries) {
    metadata.chartData = clonePlain(manifest.data.timeseries);
  }

  if (manifestTableData) {
    metadata.tableData = {
      headers: [...manifestTableData.headers],
      rows: manifestTableData.rows.map(row => ({ ...row })),
    };
  }

  const dimensionSummary = Array.isArray(selection.dimensions)
    ? selection.dimensions
        .map(dimension => sanitizeSegment(dimension.value) || sanitizeSegment(dimension.name))
        .filter(Boolean)
        .join(' / ')
    : '';

  const title = selection.label || (dimensionSummary ? `${selection.metric} · ${dimensionSummary}` : selection.metric);

  return {
    id: selection.key || `${atomId}-${index}-${componentType}`,
    title: title || selection.metric,
    componentType,
    metadata,
    manifest,
    manifestId,
  };
};

const FeatureOverviewExhibition: React.FC<FeatureOverviewExhibitionProps> = ({
  atomId,
  cardId,
  atomColor,
  selections,
  onRemoveSelection: _onRemoveSelection,
  onRenameSelection,
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draftNames, setDraftNames] = useState<Record<string, string>>({});
  const [expandedPreviewSelections, setExpandedPreviewSelections] = useState<Record<string, boolean>>({});
  const [openSettingsSelections, setOpenSettingsSelections] = useState<Record<string, boolean>>({});
  const [visibility, setVisibility] = useState<Record<VisibilityToggleKey, boolean>>(DEFAULT_VISIBILITY);
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

  const stagedRows = useMemo(
    () =>
      selections
        .map(selection => selection.skuRow)
        .filter((row): row is Record<string, any> => row != null && typeof row === 'object'),
    [selections],
  );

  const stagedColumns = useMemo(() => {
    if (stagedRows.length === 0) {
      return [] as string[];
    }

    const columnSet = new Set<string>();
    stagedRows.forEach(row => {
      Object.keys(row).forEach(column => columnSet.add(column));
    });

    return Array.from(columnSet);
  }, [stagedRows]);

  const processedSelections = useMemo(
    () =>
      selections.map((selection, index) =>
        normaliseSelectionForExhibition({
          selection,
          index,
          atomId,
          resolvedAtomTitle,
          visibility,
          stagedRows,
          stagedColumns,
        }),
      ),
    [selections, atomId, resolvedAtomTitle, visibility, stagedRows, stagedColumns],
  );

  const toggleVisibilitySetting = (key: VisibilityToggleKey) => {
    setVisibility(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const highlightBackgroundClass = atomColor && atomColor.trim().length > 0 ? atomColor : 'bg-amber-100';

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

    const exhibitedComponents: ExhibitionComponentPayload[] = processedSelections.flatMap(
      ({
        id,
        title,
        componentType,
        metadata,
        manifest,
        manifestId,
      }) => {
        const componentLabel =
          componentType === 'trend_analysis' ? 'Trend Analysis' : 'Statistical Summary';

        const metadataPayload = clonePlain(metadata);

        return [
          {
            id,
            atomId,
            title: `${title} · ${componentLabel}`,
            category: 'Feature Overview',
            color: 'bg-amber-500',
            metadata: metadataPayload,
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
            {selections.map((selection, index) => {
              const processed = processedSelections[index];
              if (!processed) {
                return null;
              }

              const componentType = processed.componentType;
              const typePrefix = getComponentPrefix(componentType);
              const defaultEditableName = buildDefaultEditableName(selection);
              const currentEditableName = sanitizeSegment(selection.label) || defaultEditableName;
              const baseDescriptor = buildBaseDescriptor(selection) || 'Not specified';
              const displayEditableName = `${typePrefix}${currentEditableName ? ` - ${currentEditableName}` : ''}`;
              const displayActualName = `${typePrefix}${baseDescriptor ? ` - ${baseDescriptor}` : ''}`;
              const isEditing = editingKey === selection.key;
              const draftValue = draftNames[selection.key] ?? currentEditableName;
              const isPreviewOpen = expandedPreviewSelections[selection.key] ?? false;
              const isSettingsOpen = openSettingsSelections[selection.key] ?? false;

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

              const togglePreview = () => {
                setExpandedPreviewSelections(prev => ({
                  ...prev,
                  [selection.key]: !isPreviewOpen,
                }));
              };

              const toggleSettings = () => {
                setOpenSettingsSelections(prev => ({
                  ...prev,
                  [selection.key]: !isSettingsOpen,
                }));
              };

              const highlightClasses = clsx(
                'flex w-full flex-wrap items-center gap-2 rounded-md px-2 py-1 text-sm font-semibold text-black shadow-sm',
                highlightBackgroundClass,
              );

              const showDetailSections = isSettingsOpen || isPreviewOpen;

              return (
                <div
                  key={selection.key}
                  className="rounded-lg border border-gray-200 bg-white/80 px-3 py-3 shadow-sm space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <div className={highlightClasses}>
                          <span className="text-xs font-semibold uppercase tracking-wide text-black/80">
                            {typePrefix}
                          </span>
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
                            className="h-8 flex-1 min-w-0 border border-black/10 bg-white/70 text-sm font-semibold text-black focus-visible:ring-emerald-500"
                          />
                        </div>
                      ) : (
                        <div className={clsx(highlightClasses, 'justify-between')}>
                          <span className="truncate">{displayEditableName}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
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
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-gray-500 hover:text-gray-700"
                        onClick={toggleSettings}
                      >
                        <Settings2 className="h-4 w-4" />
                        <span className="sr-only">Toggle visibility settings</span>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-gray-500 hover:text-gray-700"
                        onClick={togglePreview}
                        aria-expanded={isPreviewOpen}
                      >
                        <ChevronDown className={clsx('h-4 w-4 transition-transform', isPreviewOpen && 'rotate-180')} />
                        <span className="sr-only">Toggle preview</span>
                      </Button>
                    </div>
                  </div>

                  <p className="text-xs font-medium text-gray-700">{displayActualName}</p>

                  {showDetailSections && (
                    <div className="space-y-4 border-t border-gray-200 pt-3">
                      {isSettingsOpen && (
                        <div>
                          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-700">
                            <Settings2 className="h-3.5 w-3.5" />
                            Visibility settings
                          </div>
                          <div className="mt-2 space-y-2">
                            {VISIBILITY_TOGGLES.map(toggle => (
                              <label
                                key={toggle.key}
                                className="flex items-center justify-between rounded-md border border-gray-200 bg-white/70 px-3 py-2 text-xs text-gray-700"
                              >
                                <span className="font-medium">{toggle.label}</span>
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                                  checked={visibility[toggle.key]}
                                  onChange={() => toggleVisibilitySetting(toggle.key)}
                                />
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      {isPreviewOpen && (
                        <div>
                          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-700">
                            <Image className="h-3.5 w-3.5" />
                            Preview snapshot
                          </div>
                          <div className="mt-2 overflow-hidden rounded-md border border-gray-200 bg-white/80 p-2">
                            <div className="pointer-events-none select-none">
                              <ExhibitionFeatureOverview metadata={processed.metadata} variant="compact" />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
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
