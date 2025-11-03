import { molecules } from '@/components/MoleculeList/data';
import { LayoutCard, DroppedAtom } from '../../store/laboratoryStore';
import { atoms as allAtoms } from '@/components/AtomList/data';

export interface WorkflowMolecule {
  moleculeId: string;
  moleculeTitle: string;
  atoms: Array<{ atomName: string; order: number }>;
}

export const deriveWorkflowMolecules = (cards: LayoutCard[]): WorkflowMolecule[] => {
  const map = new Map<string, WorkflowMolecule>();
  cards.forEach(card => {
    if (card.moleculeId) {
      const info = molecules.find(m => m.id === card.moleculeId);
      if (!map.has(card.moleculeId)) {
        map.set(card.moleculeId, {
          moleculeId: card.moleculeId,
          moleculeTitle: card.moleculeTitle || (info ? info.title : card.moleculeId),
          atoms: []
        });
      }
    }
  });
  return Array.from(map.values());
};

// LLM mapping for atoms that support AI agents
const LLM_MAP: Record<string, string> = {
  concat: 'Agent Concat',
  'chart-maker': 'Agent Chart Maker',
  merge: 'Agent Merge',
  'create-column': 'Agent Create Transform',
  'groupby-wtg-avg': 'Agent GroupBy',
  'explore': 'Agent Explore',
  'dataframe-operations': 'Agent DataFrame Operations',
};

/**
 * Converts workflow molecules to Laboratory cards format
 * This function takes workflow molecules from Workflow Mode and converts them
 * into LayoutCard format that can be saved to MongoDB atom_list_configuration
 * 
 * @param workflowMolecules - Array of workflow molecules with structure:
 *   { id: string, title: string, atoms: string[], atomOrder?: string[] }
 * @returns Array of LayoutCard objects ready for MongoDB persistence
 */
export const convertWorkflowMoleculesToLaboratoryCards = (
  workflowMolecules: Array<{ id: string; title: string; atoms: string[]; atomOrder?: string[] }>
): LayoutCard[] => {
  const normalize = (s: string) => s.toLowerCase().replace(/[\s_-]/g, '');
  const cards: LayoutCard[] = [];

  workflowMolecules.forEach(molecule => {
    // Use atomOrder if available, otherwise fall back to atoms array
    const atomIds = molecule.atomOrder || molecule.atoms;

    atomIds.forEach((atomIdOrName: string, index: number) => {
      // Find atom info by matching ID or title (normalized)
      const atomInfo = allAtoms.find(
        a =>
          normalize(a.id) === normalize(atomIdOrName) ||
          normalize(a.title) === normalize(atomIdOrName),
      ) || ({} as any);

      const resolvedAtomId = atomInfo.id || atomIdOrName;

      // Create DroppedAtom with all required fields
      const droppedAtom: DroppedAtom = {
        id: `${resolvedAtomId}-${Date.now()}-${Math.random()}`,
        atomId: resolvedAtomId,
        title: atomInfo.title || atomIdOrName,
        category: atomInfo.category || 'Atom',
        color: atomInfo.color || 'bg-gray-400',
        source: 'manual',
        llm: LLM_MAP[resolvedAtomId],
      };

      // Create LayoutCard with molecule association
      const card: LayoutCard = {
        id: `card-${resolvedAtomId}-${Date.now()}-${Math.random()}`,
        atoms: [droppedAtom],
        isExhibited: false,
        moleculeId: molecule.id,
        moleculeTitle: molecule.title,
      };

      cards.push(card);
    });
  });

  return cards;
};
