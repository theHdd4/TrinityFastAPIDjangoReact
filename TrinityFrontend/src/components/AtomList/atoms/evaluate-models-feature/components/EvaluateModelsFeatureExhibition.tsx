import React, { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronDown, Image, PencilLine, Settings2, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { resolveProjectContext } from '@/utils/projectEnv';
import {
  fetchExhibitionConfiguration,
  saveExhibitionConfiguration,
  loadSavedConfiguration,
  type ExhibitionAtomPayload,
  type ExhibitionComponentPayload,
  type ExhibitionConfigurationPayload,
} from '@/lib/exhibition';
import type {
  EvaluateModelsFeatureExhibitionComponentType,
  EvaluateModelsFeatureExhibitionSelection,
} from '@/components/LaboratoryMode/store/laboratoryStore';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { useExhibitionStore } from '@/components/ExhibitionMode/store/exhibitionStore';
import EvaluateModelsFeature from '@/components/ExhibitionMode/components/atoms/EvaluateModelsFeature';

export interface EvaluateModelsFeatureExhibitionHandle {
  exhibit: () => Promise<void>;
  getSelectionCount: () => number;
}

interface EvaluateModelsFeatureExhibitionProps {
  atomId: string;
  cardId?: string | null;
  atomColor?: string | null;
  selections: EvaluateModelsFeatureExhibitionSelection[];
  onRemoveSelection?: (key: string) => void;
  onRenameSelection?: (key: string, name: string) => void;
}

const EvaluateModelsFeatureExhibition = React.forwardRef<
  EvaluateModelsFeatureExhibitionHandle,
  EvaluateModelsFeatureExhibitionProps
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
      return sourceAtomTitle || 'Evaluate Models Feature';
    }, [sourceAtomTitle]);

    const highlightBackgroundClass = atomColor && atomColor.trim().length > 0 ? atomColor : 'bg-orange-100';

    // Process selections to create proper metadata structure for preview and exhibition
    const processedSelections = React.useMemo(() => {
      return selections.map((selection) => {
        // Create a metadata structure similar to FeatureOverview
        const metadata = {
          graphId: selection.graphId,
          graphTitle: selection.graphTitle,
          graphState: selection.graphState,
          graphContext: selection.graphContext,
          capturedAt: selection.capturedAt,
          sourceAtomTitle: resolvedAtomTitle,
        };

        return {
          id: selection.graphId || selection.key,
          title: selection.graphTitle,
          metadata,
          selection,
        };
      });
    }, [selections, resolvedAtomTitle]);

    const handleExhibit = React.useCallback(async () => {
        if (selectionCount === 0) {
        toast({
          title: 'Select graphs to exhibit',
          description: 'Right-click on graph headings to stage graphs for exhibition.',
          variant: 'destructive',
        });
        return;
      }

      const context = await resolveProjectContext();
      if (!context || !context.client_name || !context.app_name || !context.project_name) {
        toast({
          title: 'Project details required',
          description: 'Please choose a client, app, and project before exhibiting graphs.',
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
          console.warn(
            `[Exhibition] Failed to fetch existing exhibition configuration for project ${client_name}/${app_name}/${project_name}:`,
            error,
          );
        }

        const exhibitedComponents: ExhibitionComponentPayload[] = processedSelections.map((processed) => {
          // Deep clone the metadata for MongoDB storage, similar to ChartMaker
          const metadataPayload = JSON.parse(JSON.stringify(processed.metadata));

          return {
            id: processed.id,
            atomId: 'evaluate-models-feature',
            title: `${processed.title} · Evaluate Models Feature`,
            category: 'Evaluate Models Feature',
            color: 'bg-orange-500',
            metadata: metadataPayload,
          };
        });

        // Use the same cardIdentifier pattern as ChartMaker and FeatureOverview
        const cardIdentifierForStorage = cardId || atomId;

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

          return identifier !== cardIdentifierForStorage;
        });

        const newEntry: ExhibitionAtomPayload = {
          id: cardIdentifierForStorage,
          atom_name: resolvedAtomTitle,
          exhibited_components: exhibitedComponents,
        };

        const configurationPayload: ExhibitionConfigurationPayload = {
          client_name,
          app_name,
          project_name,
          atoms: [...retainedAtoms, newEntry],
        };


        await saveExhibitionConfiguration(configurationPayload);
        
        console.info(
          `[Exhibition] exhibition_catalogue collection successfully updated for project ${client_name}/${app_name}/${project_name} with ${selectionCount} exhibited graph(s)`,
        );
        
        toast({
          title: 'Exhibition catalogue updated',
          description: 'Your selected graphs are now ready to be exhibited.',
        });

        // Load the saved configuration into the exhibition store
        await loadSavedConfiguration(context);
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
    }, [selectionCount, processedSelections, resolvedAtomTitle, loadSavedConfiguration, toast]);

    React.useImperativeHandle(ref, () => ({
      exhibit: handleExhibit,
      getSelectionCount: () => selectionCount,
    }), [handleExhibit, selectionCount]);

    const startEditing = (key: string) => {
      const selection = selections.find(s => s.key === key);
      setDraftNames(prev => ({ ...prev, [key]: selection?.graphTitle || '' }));
      setEditingKey(key);
    };

    const finishEditing = (key: string) => {
      const draftName = draftNames[key];
      if (draftName && draftName.trim() && onRenameSelection) {
        onRenameSelection(key, draftName.trim());
      }
      setEditingKey(null);
      setDraftNames(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    };

    const togglePreview = (key: string) => {
      setExpandedPreviewSelections(prev => ({
        ...prev,
        [key]: !prev[key],
      }));
    };

    if (selectionCount === 0) {
      return null;
    }

    const showDetailSections = selectionCount > 0;

  return (
      <div className="space-y-3">
        {showDetailSections && (
          <div className="space-y-3">
            {processedSelections.map((processed) => {
              const selection = processed.selection;
              const isPreviewOpen = expandedPreviewSelections[selection.key];
              const isEditing = editingKey === selection.key;
              const draftValue = draftNames[selection.key] ?? selection.graphTitle;

              const togglePreview = () => {
                setExpandedPreviewSelections(prev => ({
                  ...prev,
                  [selection.key]: !prev[selection.key],
                }));
              };

              const finishEditing = (commit: boolean) => {
                if (commit) {
                  const draft = draftNames[selection.key];
                  if (draft && draft.trim() && onRenameSelection) {
                    onRenameSelection(selection.key, draft.trim());
                  }
                }
                setEditingKey(null);
                setDraftNames(prev => {
                  const next = { ...prev };
                  delete next[selection.key];
                  return next;
                });
              };

              const startEditing = () => {
                setDraftNames(prev => ({ ...prev, [selection.key]: selection.graphTitle }));
                setEditingKey(selection.key);
              };

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
                            <span className="truncate">{selection.graphTitle}</span>
                          </div>
                        </div>
                      )}
                      <div className="mt-1 text-xs text-gray-500">
                        Graph ID: {selection.graphId}
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
                          disabled={isSaving}
                        >
                          <PencilLine className="h-3 w-3" />
                          <span className="sr-only">Edit</span>
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => _onRemoveSelection?.(selection.key)}
                        className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                        disabled={isSaving}
                      >
                        <X className="w-3 h-3" />
                      </Button>
            </div>
      </div>

                  <p className="text-xs font-medium text-gray-700">{selection.graphTitle}</p>

                  {showDetailSections && (
                    <div className="space-y-4 border-t border-gray-200 pt-3">
                      {isPreviewOpen && (
                        <div>
                          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-700">
                            <Image className="h-3.5 w-3.5" />
                            Preview snapshot
            </div>
                          <div className="mt-2 rounded-md border border-gray-200 bg-white/80 p-2">
                            <div className="overflow-auto">
                              <EvaluateModelsFeature 
                                metadata={processed.metadata} 
                                variant="full" 
                              />
            </div>
                            <p className="mt-3 text-center text-sm font-semibold text-gray-900">
                              {selection.graphTitle}
                            </p>
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

EvaluateModelsFeatureExhibition.displayName = 'EvaluateModelsFeatureExhibition';

export default EvaluateModelsFeatureExhibition;