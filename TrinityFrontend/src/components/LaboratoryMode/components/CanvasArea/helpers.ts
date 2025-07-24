import { molecules } from '@/components/MoleculeList/data';
import { LayoutCard } from '../store/laboratoryStore';

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
