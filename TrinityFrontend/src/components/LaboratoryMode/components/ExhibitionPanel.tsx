import React from 'react';
import clsx from 'clsx';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { atomCategories } from '@/components/AtomCategory/data/atomCategories';
import type { LucideIcon } from 'lucide-react';
import { ChevronDown, ChevronRight, FolderKanban, GalleryHorizontal, Loader2, Play, Send } from 'lucide-react';
import FeatureOverviewExhibition, {
  FeatureOverviewExhibitionHandle,
} from '@/components/AtomList/atoms/feature-overview/components/FeatureOverviewExhibition';
import ChartMakerExhibition, {
  ChartMakerExhibitionHandle,
} from '@/components/AtomList/atoms/chart-maker/components/ChartMakerExhibition';
import EvaluateModelsFeatureExhibition, {
  EvaluateModelsFeatureExhibitionHandle,
} from '@/components/AtomList/atoms/evaluate-models-feature/components/EvaluateModelsFeatureExhibition';
import {
  useLaboratoryStore,
  type FeatureOverviewExhibitionSelection,
  type ChartMakerExhibitionSelection,
  type EvaluateModelsFeatureExhibitionSelection,
} from '../store/laboratoryStore';

interface ExhibitionPanelProps {
  onToggle: () => void;
}

interface ExhibitedAtomEntry {
  atomId: string;
  atomTypeId: string;
  atomTitle?: string;
  cardId: string;
  atomColor?: string;
  selections: FeatureOverviewExhibitionSelection[] | ChartMakerExhibitionSelection[] | EvaluateModelsFeatureExhibitionSelection[];
}

interface AtomInfo {
  title: string;
  icon: LucideIcon;
  color: string;
}

const ExhibitionPanel: React.FC<ExhibitionPanelProps> = ({ onToggle }) => {
  const cards = useLaboratoryStore((state) => state.cards);
  const getAtom = useLaboratoryStore((state) => state.getAtom);
  const updateAtomSettings = useLaboratoryStore((state) => state.updateAtomSettings);

  const exhibitedAtoms = React.useMemo<ExhibitedAtomEntry[]>(() => {
    const entries: ExhibitedAtomEntry[] = [];

    cards.forEach((card) => {
      card.atoms.forEach((atom) => {
        // Check for both feature-overview and chart-maker atoms
        if (atom.atomId === 'feature-overview') {
          const selections = Array.isArray(atom.settings?.exhibitionSelections)
            ? (atom.settings.exhibitionSelections as FeatureOverviewExhibitionSelection[])
            : [];

          if (selections.length > 0) {
            const atomColor = typeof atom.color === 'string' ? atom.color : undefined;
            const atomTypeId = typeof atom.atomId === 'string' ? atom.atomId : 'unknown';
            const atomTitle = typeof atom.title === 'string' ? atom.title : undefined;
            entries.push({
              atomId: atom.id,
              atomTypeId,
              atomTitle,
              cardId: card.id,
              atomColor,
              selections,
            });
          }
        } else if (atom.atomId === 'chart-maker') {
          const selections = Array.isArray(atom.settings?.exhibitionSelections)
            ? (atom.settings.exhibitionSelections as ChartMakerExhibitionSelection[])
            : [];

          if (selections.length > 0) {
            const atomColor = typeof atom.color === 'string' ? atom.color : undefined;
            const atomTypeId = typeof atom.atomId === 'string' ? atom.atomId : 'unknown';
            const atomTitle = typeof atom.title === 'string' ? atom.title : undefined;
            entries.push({
              atomId: atom.id,
              atomTypeId,
              atomTitle,
              cardId: card.id,
              atomColor,
              selections,
            });
          }
        } else if (atom.atomId === 'evaluate-models-feature') {
          const selections = Array.isArray(atom.settings?.exhibitionSelections)
            ? (atom.settings.exhibitionSelections as EvaluateModelsFeatureExhibitionSelection[])
            : [];

          if (selections.length > 0) {
            const atomColor = typeof atom.color === 'string' ? atom.color : undefined;
            const atomTypeId = typeof atom.atomId === 'string' ? atom.atomId : 'unknown';
            const atomTitle = typeof atom.title === 'string' ? atom.title : undefined;
            entries.push({
              atomId: atom.id,
              atomTypeId,
              atomTitle,
              cardId: card.id,
              atomColor,
              selections,
            });
          }
        }
      });
    });

    return entries;
  }, [cards]);

  const totalSelections = React.useMemo(
    () => exhibitedAtoms.reduce((acc, entry) => acc + entry.selections.length, 0),
    [exhibitedAtoms],
  );

  const fallbackAtomInfo = React.useMemo<AtomInfo>(
    () => ({ title: 'Atom', icon: FolderKanban, color: 'bg-slate-500' }),
    [],
  );

  const atomInfoMap = React.useMemo(() => {
    const map = new Map<string, AtomInfo>();
    atomCategories.forEach((category) => {
      category.atoms.forEach((atom) => {
        map.set(atom.id, {
          title: atom.title,
          icon: category.icon,
          color: category.color,
        });
      });
    });
    return map;
  }, [atomCategories]);

  const atomPanels = React.useMemo(
    () =>
      exhibitedAtoms.map((entry) => {
        const info = atomInfoMap.get(entry.atomTypeId) ?? fallbackAtomInfo;
        const title = entry.atomTitle ?? info.title;
        return {
          key: `${entry.cardId}-${entry.atomId}`,
          info: {
            title: title || info.title,
            icon: info.icon,
            color: info.color,
          },
          entry,
          total: entry.selections.length,
        };
      }),
    [atomInfoMap, exhibitedAtoms, fallbackAtomInfo],
  );

  const [expandedAtomKey, setExpandedAtomKey] = React.useState<string | null>(null);
  const hasInitialisedExpandedAtomRef = React.useRef(false);
  const exhibitionHandlesRef = React.useRef<Map<string, FeatureOverviewExhibitionHandle | ChartMakerExhibitionHandle | EvaluateModelsFeatureExhibitionHandle>>(new Map());
  const [exhibitingAtomKey, setExhibitingAtomKey] = React.useState<string | null>(null);
  const [isExhibitingAll, setIsExhibitingAll] = React.useState(false);

  React.useEffect(() => {
    if (atomPanels.length === 0) {
      if (expandedAtomKey !== null) {
        setExpandedAtomKey(null);
      }
      hasInitialisedExpandedAtomRef.current = false;
      return;
    }

    const activeExists = expandedAtomKey
      ? atomPanels.some((panel) => panel.key === expandedAtomKey)
      : false;

    if (expandedAtomKey && !activeExists) {
      setExpandedAtomKey(atomPanels[0]?.key ?? null);
      return;
    }

    if (!hasInitialisedExpandedAtomRef.current) {
      hasInitialisedExpandedAtomRef.current = true;
      setExpandedAtomKey((current) => {
        if (current && atomPanels.some((panel) => panel.key === current)) {
          return current;
        }

        return atomPanels[0]?.key ?? null;
      });
    }
  }, [atomPanels, expandedAtomKey]);

  const handleRemoveSelection = React.useCallback(
    (atomId: string, key: string) => {
      const atom = getAtom(atomId);
      if (!atom) {
        return;
      }

      const currentSelections = Array.isArray(atom.settings?.exhibitionSelections)
        ? (atom.settings.exhibitionSelections as (FeatureOverviewExhibitionSelection | ChartMakerExhibitionSelection | EvaluateModelsFeatureExhibitionSelection)[])
        : [];
      const nextSelections = currentSelections.filter((selection) => selection.key !== key);
      updateAtomSettings(atomId, { exhibitionSelections: nextSelections });
    },
    [getAtom, updateAtomSettings],
  );

  const handleRenameSelection = React.useCallback(
    (atomId: string, key: string, name: string) => {
      const atom = getAtom(atomId);
      if (!atom) {
        return;
      }

      const currentSelections = Array.isArray(atom.settings?.exhibitionSelections)
        ? (atom.settings.exhibitionSelections as (FeatureOverviewExhibitionSelection | ChartMakerExhibitionSelection | EvaluateModelsFeatureExhibitionSelection)[])
        : [];

      const nextSelections = currentSelections.map((selection) => {
        if (selection.key === key) {
          // Handle different property names for different atom types
          if ('label' in selection) {
            return { ...selection, label: name };
          } else if ('chartTitle' in selection) {
            return { ...selection, chartTitle: name };
          } else if ('graphTitle' in selection) {
            return { ...selection, graphTitle: name };
          }
        }
        return selection;
      });

      updateAtomSettings(atomId, { exhibitionSelections: nextSelections });
    },
    [getAtom, updateAtomSettings],
  );

  const handleExhibitAtom = React.useCallback(
    async (panelKey: string) => {
      const handle = exhibitionHandlesRef.current.get(panelKey);
      if (!handle || handle.getSelectionCount() === 0) {
        return;
      }

      setExhibitingAtomKey(panelKey);
      try {
        await handle.exhibit();
      } finally {
        setExhibitingAtomKey((current) => (current === panelKey ? null : current));
      }
    },
    [],
  );

  const handleExhibitAll = React.useCallback(async () => {
    if (totalSelections === 0 || atomPanels.length === 0) {
      return;
    }

    setIsExhibitingAll(true);
    try {
      for (const panel of atomPanels) {
        const handle = exhibitionHandlesRef.current.get(panel.key);
        if (!handle || handle.getSelectionCount() === 0) {
          continue;
        }

        await handle.exhibit();
      }
    } finally {
      setIsExhibitingAll(false);
      setExhibitingAtomKey(null);
    }
  }, [atomPanels, totalSelections]);

  return (
    <div className="bg-white border-l border-gray-200 transition-all duration-300 flex flex-col h-full w-80">
      <div className="p-3 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GalleryHorizontal className="w-4 h-4 text-gray-700" />
          <h3 className="font-semibold text-gray-900">Exhibition</h3>
          <Badge variant="secondary" className="ml-1">
            {totalSelections} {totalSelections === 1 ? 'item' : 'items'}
          </Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={onToggle} className="p-1 h-8 w-8">
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 p-4 space-y-4">
        {atomPanels.length === 0 ? (
          <div className="text-sm text-gray-600">
            Stage components for exhibition from the laboratory to view them here.
          </div>
        ) : (
          atomPanels.map((panel) => {
            const Icon = panel.info.icon ?? FolderKanban;
            const isExpanded = expandedAtomKey === panel.key;
            const totalLabel = panel.total === 1 ? '1 component' : `${panel.total} components`;
            const isAtomExhibiting = exhibitingAtomKey === panel.key;

            return (
              <div
                key={panel.key}
                className="rounded-xl border border-gray-200 bg-white/70 shadow-sm transition hover:border-gray-300"
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    className="flex flex-1 items-center gap-3 px-4 py-3 text-left"
                    onClick={() =>
                      setExpandedAtomKey((current) => (current === panel.key ? null : panel.key))
                    }
                  >
                    <span
                      className={clsx(
                        'flex h-10 w-10 items-center justify-center rounded-full text-white shadow-sm',
                        panel.info.color,
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-gray-900">{panel.info.title}</span>
                      <span className="text-xs text-gray-500">{totalLabel}</span>
                    </span>
                  </button>
                  <div className="flex items-center gap-1 pr-3">
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                      onClick={() =>
                        setExpandedAtomKey((current) => (current === panel.key ? null : panel.key))
                      }
                      aria-expanded={isExpanded}
                      aria-controls={`${panel.key}-exhibition-list`}
                    >
                      <ChevronDown
                        className={clsx('h-4 w-4 transition-transform', isExpanded && 'rotate-180')}
                      />
                      <span className="sr-only">Toggle {panel.info.title} exhibition list</span>
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-gray-500 hover:text-gray-700"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleExhibitAtom(panel.key);
                      }}
                      disabled={panel.total === 0 || isAtomExhibiting || isExhibitingAll}
                    >
                      {isAtomExhibiting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                      <span className="sr-only">Exhibit components from {panel.info.title}</span>
                    </Button>
                  </div>
                </div>

                <div
                  className={clsx(
                    'space-y-4 border-t border-gray-200 bg-white/80 px-4 py-4',
                    !isExpanded && 'hidden',
                  )}
                  id={`${panel.key}-exhibition-list`}
                  aria-hidden={!isExpanded}
                >
                  {/* Render FeatureOverviewExhibition for feature-overview atoms */}
                  {panel.entry.atomTypeId === 'feature-overview' && (
                    <FeatureOverviewExhibition
                      ref={(instance: FeatureOverviewExhibitionHandle | null) => {
                        if (instance) {
                          exhibitionHandlesRef.current.set(panel.key, instance);
                        } else {
                          exhibitionHandlesRef.current.delete(panel.key);
                        }
                      }}
                      atomId={panel.entry.atomId}
                      cardId={panel.entry.cardId}
                      atomColor={panel.entry.atomColor}
                      selections={panel.entry.selections as FeatureOverviewExhibitionSelection[]}
                      onRemoveSelection={(key) => handleRemoveSelection(panel.entry.atomId, key)}
                      onRenameSelection={(key, name) => handleRenameSelection(panel.entry.atomId, key, name)}
                    />
                  )}
                  
                  {/* Render ChartMakerExhibition for chart-maker atoms */}
                  {panel.entry.atomTypeId === 'chart-maker' && (
                    <ChartMakerExhibition
                      ref={(instance: ChartMakerExhibitionHandle | null) => {
                        if (instance) {
                          exhibitionHandlesRef.current.set(panel.key, instance);
                        } else {
                          exhibitionHandlesRef.current.delete(panel.key);
                        }
                      }}
                      atomId={panel.entry.atomId}
                      cardId={panel.entry.cardId}
                      atomColor={panel.entry.atomColor}
                      selections={panel.entry.selections as ChartMakerExhibitionSelection[]}
                      onRemoveSelection={(key) => handleRemoveSelection(panel.entry.atomId, key)}
                      onRenameSelection={(key, name) => handleRenameSelection(panel.entry.atomId, key, name)}
                    />
                  )}
                  
                  {/* Render EvaluateModelsFeatureExhibition for evaluate-models-feature atoms */}
                  {panel.entry.atomTypeId === 'evaluate-models-feature' && (
                    <EvaluateModelsFeatureExhibition
                      ref={(instance: EvaluateModelsFeatureExhibitionHandle | null) => {
                        if (instance) {
                          exhibitionHandlesRef.current.set(panel.key, instance);
                        } else {
                          exhibitionHandlesRef.current.delete(panel.key);
                        }
                      }}
                      atomId={panel.entry.atomId}
                      cardId={panel.entry.cardId}
                      atomColor={panel.entry.atomColor}
                      selections={panel.entry.selections as EvaluateModelsFeatureExhibitionSelection[]}
                      onRemoveSelection={(key) => handleRemoveSelection(panel.entry.atomId, key)}
                      onRenameSelection={(key, name) => handleRenameSelection(panel.entry.atomId, key, name)}
                    />
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-gray-200 bg-white/90 p-4 space-y-2">
        <Button
          type="button"
          className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:from-emerald-600 hover:to-emerald-700"
          size="lg"
          onClick={() => void handleExhibitAll()}
          disabled={totalSelections === 0 || isExhibitingAll}
        >
          {isExhibitingAll ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Exhibiting…
            </>
          ) : (
            <>
              <Send className="mr-2 h-4 w-4" />
              Exhibit all
            </>
          )}
        </Button>
        {totalSelections === 0 && (
          <p className="text-xs text-gray-500 text-center">
            Stage components for exhibition in the laboratory to enable the Exhibit action.
          </p>
        )}
      </div>
    </div>
  );
};

export default ExhibitionPanel;