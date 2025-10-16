import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronRight, GalleryHorizontal } from 'lucide-react';
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
  cardId: string;
  selections: FeatureOverviewExhibitionSelection[];
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
          entries.push({
            atomId: atom.id,
            cardId: card.id,
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
        {exhibitedAtoms.length === 0 ? (
          <div className="text-sm text-gray-600">
            Stage components for exhibition from the laboratory to view them here.
          </div>
        ) : (
          exhibitedAtoms.map((entry) => (
            <div key={`${entry.cardId}-${entry.atomId}`} className="min-w-0">
              <FeatureOverviewExhibition
                atomId={entry.atomId}
                cardId={entry.cardId}
                selections={entry.selections}
                onRemoveSelection={(key) => handleRemoveSelection(entry.atomId, key)}
                onRenameSelection={(key, name) => handleRenameSelection(entry.atomId, key, name)}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ExhibitionPanel;
