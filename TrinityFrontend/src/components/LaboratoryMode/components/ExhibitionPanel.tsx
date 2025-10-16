import React from 'react';
import clsx from 'clsx';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { atomCategories } from '@/components/AtomCategory/data/atomCategories';
import type { LucideIcon } from 'lucide-react';
import { ChevronDown, ChevronRight, FolderKanban, GalleryHorizontal } from 'lucide-react';
import FeatureOverviewExhibition from '@/components/AtomList/atoms/feature-overview/components/FeatureOverviewExhibition';
import {
  useLaboratoryStore,
  type FeatureOverviewExhibitionSelection,
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
  selections: FeatureOverviewExhibitionSelection[];
}

interface AtomCategoryInfo {
  name: string;
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
        if (atom.atomId !== 'feature-overview') {
          return;
        }

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
      });
    });

    return entries;
  }, [cards]);

  const totalSelections = React.useMemo(
    () => exhibitedAtoms.reduce((acc, entry) => acc + entry.selections.length, 0),
    [exhibitedAtoms],
  );

  const fallbackCategoryInfo = React.useMemo<AtomCategoryInfo>(
    () => ({ name: 'Other', icon: FolderKanban, color: 'bg-slate-500' }),
    [],
  );

  const atomCategoryMap = React.useMemo(() => {
    const map = new Map<string, AtomCategoryInfo>();
    atomCategories.forEach((category) => {
      category.atoms.forEach((atom) => {
        map.set(atom.id, {
          name: category.name,
          icon: category.icon,
          color: category.color,
        });
      });
    });
    return map;
  }, [atomCategories]);

  const categoryGroups = React.useMemo(() => {
    const groups = new Map<string, { info: AtomCategoryInfo; entries: ExhibitedAtomEntry[]; total: number }>();

    exhibitedAtoms.forEach((entry) => {
      const info = atomCategoryMap.get(entry.atomTypeId) ?? fallbackCategoryInfo;
      if (!groups.has(info.name)) {
        groups.set(info.name, { info, entries: [], total: 0 });
      }
      const bucket = groups.get(info.name);
      if (!bucket) {
        return;
      }
      bucket.entries.push(entry);
      bucket.total += entry.selections.length;
    });

    const ordered: Array<{ info: AtomCategoryInfo; entries: ExhibitedAtomEntry[]; total: number }> = [];
    atomCategories.forEach((category) => {
      const existing = groups.get(category.name);
      if (existing) {
        ordered.push(existing);
        groups.delete(category.name);
      }
    });

    groups.forEach((group) => {
      ordered.push(group);
    });

    return ordered;
  }, [atomCategories, atomCategoryMap, exhibitedAtoms, fallbackCategoryInfo]);

  const [expandedCategory, setExpandedCategory] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (categoryGroups.length === 0) {
      if (expandedCategory !== null) {
        setExpandedCategory(null);
      }
      return;
    }

    const activeCategoryExists = expandedCategory
      ? categoryGroups.some((group) => group.info.name === expandedCategory)
      : false;

    if (!expandedCategory || !activeCategoryExists) {
      setExpandedCategory((current) => {
        const next = categoryGroups[0]?.info.name ?? null;
        return current === next ? current : next;
      });
    }
  }, [categoryGroups, expandedCategory]);

  const handleRemoveSelection = React.useCallback(
    (atomId: string, key: string) => {
      const atom = getAtom(atomId);
      if (!atom) {
        return;
      }

      const currentSelections = Array.isArray(atom.settings?.exhibitionSelections)
        ? (atom.settings.exhibitionSelections as FeatureOverviewExhibitionSelection[])
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
        ? (atom.settings.exhibitionSelections as FeatureOverviewExhibitionSelection[])
        : [];

      const nextSelections = currentSelections.map((selection) =>
        selection.key === key ? { ...selection, label: name } : selection,
      );

      updateAtomSettings(atomId, { exhibitionSelections: nextSelections });
    },
    [getAtom, updateAtomSettings],
  );

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
        {categoryGroups.length === 0 ? (
          <div className="text-sm text-gray-600">
            Stage components for exhibition from the laboratory to view them here.
          </div>
        ) : (
          categoryGroups.map((group) => {
            const Icon = group.info.icon ?? FolderKanban;
            const isExpanded = expandedCategory === group.info.name;
            const totalLabel = group.total === 1 ? '1 component' : `${group.total} components`;

            return (
              <div
                key={group.info.name}
                className="rounded-xl border border-gray-200 bg-white/70 shadow-sm transition hover:border-gray-300"
              >
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
                  onClick={() =>
                    setExpandedCategory((current) => (current === group.info.name ? null : group.info.name))
                  }
                >
                  <span className="flex items-center gap-3">
                    <span
                      className={clsx(
                        'flex h-10 w-10 items-center justify-center rounded-full text-white shadow-sm',
                        group.info.color,
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-gray-900">{group.info.name}</span>
                      <span className="text-xs text-gray-500">{totalLabel}</span>
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="flex h-7 min-w-[28px] items-center justify-center rounded-full bg-emerald-100 px-2 text-sm font-semibold text-emerald-700">
                      {group.total}
                    </span>
                    <ChevronDown
                      className={clsx('h-4 w-4 text-gray-500 transition-transform', isExpanded && 'rotate-180')}
                    />
                  </span>
                </button>

                {isExpanded && (
                  <div className="space-y-4 border-t border-gray-200 bg-white/80 px-4 py-4">
                    {group.entries.map((entry) => (
                      <div key={`${entry.cardId}-${entry.atomId}`} className="min-w-0">
                        <FeatureOverviewExhibition
                          atomId={entry.atomId}
                          cardId={entry.cardId}
                          atomColor={entry.atomColor}
                          selections={entry.selections}
                          onRemoveSelection={(key) => handleRemoveSelection(entry.atomId, key)}
                          onRenameSelection={(key, name) => handleRenameSelection(entry.atomId, key, name)}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ExhibitionPanel;
