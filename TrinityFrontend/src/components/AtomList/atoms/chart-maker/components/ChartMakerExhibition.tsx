import React, { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronDown, Image, PencilLine, Settings2, X } from 'lucide-react';
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
  ChartMakerExhibitionComponentType,
  ChartMakerExhibitionSelection,
} from '@/components/LaboratoryMode/store/laboratoryStore';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { useExhibitionStore } from '@/components/ExhibitionMode/store/exhibitionStore';
import ChartMaker from '@/components/ExhibitionMode/components/atoms/ChartMaker';

export interface ChartMakerExhibitionHandle {
  exhibit: () => Promise<void>;
  getSelectionCount: () => number;
}

interface ChartMakerExhibitionProps {
  atomId: string;
  cardId?: string | null;
  atomColor?: string | null;
  selections: ChartMakerExhibitionSelection[];
  onRemoveSelection?: (key: string) => void;
  onRenameSelection?: (key: string, name: string) => void;
}

const ChartMakerExhibition = React.forwardRef<
  ChartMakerExhibitionHandle,
  ChartMakerExhibitionProps
>(
  (
    {
      atomId,
      cardId,
      atomColor,
      selections,
      onRemoveSelection: _onRemoveSelection,
      onRenameSelection,
    },
    ref,
  ) => {
    const [isSaving, setIsSaving] = useState(false);
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [draftNames, setDraftNames] = useState<Record<string, string>>({});
    const [expandedPreviewSelections, setExpandedPreviewSelections] = useState<Record<string, boolean>>({});
    const [openSettingsSelections, setOpenSettingsSelections] = useState<Record<string, boolean>>({});
    const { toast } = useToast();
    const loadSavedConfiguration = useExhibitionStore(state => state.loadSavedConfiguration);

    const selectionCount = selections.length;

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
      return sourceAtomTitle || 'Chart Maker';
    }, [sourceAtomTitle]);

  const highlightBackgroundClass = atomColor && atomColor.trim().length > 0 ? atomColor : 'bg-blue-100';

  // Process selections to create proper metadata structure for preview and exhibition
  const processedSelections = React.useMemo(() => {
    return selections.map((selection) => {
      // Create a metadata structure similar to FeatureOverview
      const metadata = {
        chartId: selection.chartId,
        chartTitle: selection.chartTitle,
        chartState: selection.chartState,
        chartContext: selection.chartContext,
        capturedAt: selection.capturedAt,
        sourceAtomTitle: resolvedAtomTitle,
      };

      return {
        id: selection.chartId || selection.key,
        title: selection.chartTitle,
        metadata,
        selection,
      };
    });
  }, [selections, resolvedAtomTitle]);

  const handleExhibit = React.useCallback(async () => {
      if (selectionCount === 0) {
        toast({
          title: 'Select charts to exhibit',
          description: 'Right-click on chart titles to stage charts for exhibition.',
          variant: 'destructive',
        });
        return;
      }

      const context = getActiveProjectContext();
      if (!context || !context.client_name || !context.app_name || !context.project_name) {
        toast({
          title: 'Project details required',
          description: 'Please choose a client, app, and project before exhibiting charts.',
          variant: 'destructive',
        });
        return;
      }

      setIsSaving(true);
      const { client_name, app_name, project_name } = context;

      try {
        let existingConfig: Awaited<ReturnType<typeof fetchExhibitionConfiguration>> | null = null;
        try {
          existingConfig = await fetchExhibitionConfiguration(context);
        } catch (error) {
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

        const exhibitedComponents: ExhibitionComponentPayload[] = processedSelections.map(
          ({ id, title, metadata }) => {
            // Deep clone the metadata for MongoDB storage, similar to FeatureOverview
            const metadataPayload = JSON.parse(JSON.stringify(metadata));

            return {
              id,
              atomId: 'chart-maker',
              title: `${title} · Chart Maker`,
              category: 'Chart Maker',
              color: 'bg-blue-500',
              metadata: metadataPayload,
            };
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
        toast({
          title: 'Exhibition catalogue updated',
          description: 'Your selected charts are now ready to be exhibited.',
        });
      } catch (error) {
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
    }, [
      selectionCount,
      toast,
      processedSelections,
      loadSavedConfiguration,
      cardId,
      atomId,
      resolvedAtomTitle,
      cardIdentifier,
    ]);

    React.useImperativeHandle(
      ref,
      () => ({
        exhibit: handleExhibit,
        getSelectionCount: () => selectionCount,
      }),
      [handleExhibit, selectionCount],
    );

    return (
      <div className="space-y-4">
        {selectionCount === 0 ? (
          <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
            No charts have been staged for exhibition yet. Right-click on chart titles to stage charts for exhibition.
          </div>
        ) : (
          <div className="space-y-3">
            {processedSelections.map((processed, index) => {
              const selection = processed.selection;
              const isEditing = editingKey === selection.key;
              const draftValue = draftNames[selection.key] ?? selection.chartTitle;
              const isPreviewOpen = expandedPreviewSelections[selection.key] ?? false;
              const isSettingsOpen = openSettingsSelections[selection.key] ?? false;

              const startEditing = () => {
                setDraftNames(prev => ({ ...prev, [selection.key]: selection.chartTitle }));
                setEditingKey(selection.key);
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
                const nextName = proposedName.length > 0 ? proposedName : selection.chartTitle;
                onRenameSelection(selection.key, nextName);
              };

              const togglePreview = () => {
                setExpandedPreviewSelections(prev => ({
                  ...prev,
                  [selection.key]: !isPreviewOpen,
                }));
              };

              const showDetailSections = isPreviewOpen;

              return (
                <div
                  key={selection.key}
                  className="rounded-lg border border-gray-200 bg-white/80 px-3 py-3 shadow-sm space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <Input
                          value={draftValue}
                          onChange={(e) => setDraftNames(prev => ({ ...prev, [selection.key]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              finishEditing(true);
                            } else if (e.key === 'Escape') {
                              finishEditing(false);
                            }
                          }}
                          onBlur={() => finishEditing(true)}
                          className="h-8 text-sm"
                          autoFocus
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className={clsx(
                            'flex w-full flex-wrap items-center gap-2 rounded-md px-2 py-1 text-sm font-semibold text-black shadow-sm',
                            highlightBackgroundClass,
                          )}>
                            <span className="truncate">{selection.chartTitle}</span>
                          </div>
                        </div>
                      )}
                      <div className="mt-1 text-xs text-gray-500">
                        Chart ID: {selection.chartId}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={togglePreview}
                        className="h-6 w-6 p-0 text-gray-500 hover:text-gray-700"
                        disabled={isSaving}
                      >
                        <ChevronDown className={clsx('h-4 w-4 transition-transform', isPreviewOpen && 'rotate-180')} />
                        <span className="sr-only">Toggle preview</span>
                      </Button>
                      {!isEditing && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={startEditing}
                          className="h-6 w-6 p-0"
                        >
                          <PencilLine className="w-3 h-3" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => _onRemoveSelection?.(selection.key)}
                        className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>

                  <p className="text-xs font-medium text-gray-700">{selection.chartTitle}</p>

                  {showDetailSections && (
                    <div className="space-y-4 border-t border-gray-200 pt-3">
                      {isPreviewOpen && (
                        <div>
                          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-700">
                            <Image className="h-3.5 w-3.5" />
                            Preview snapshot
                          </div>
                          <div className="mt-2 rounded-md border border-gray-200 bg-white/80 p-2">
                            <div className="pointer-events-none select-none">
                              <div className="overflow-auto">
                                <ChartMaker 
                                  metadata={processed.metadata} 
                                  variant="full" 
                                />
                              </div>
                              <p className="mt-3 text-center text-sm font-semibold text-gray-900">
                                {selection.chartTitle}
                              </p>
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
      </div>
    );
  },
);

ChartMakerExhibition.displayName = 'ChartMakerExhibition';

export default ChartMakerExhibition;
