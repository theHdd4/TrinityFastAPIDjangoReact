import { molecules } from '@/components/MoleculeList/data';
import { LayoutCard, DroppedAtom } from '../../store/laboratoryStore';
import { atoms as allAtoms } from '@/components/AtomList/data';

export interface WorkflowMolecule {
  moleculeId: string;
  moleculeTitle: string;
  atoms: Array<{ atomName: string; order: number }>;
  isActive?: boolean; // If false, molecule is deleted but kept for order preservation
}

export interface UnifiedRenderItem {
  type: 'molecule-container' | 'standalone-card';
  order: number; // Primary sort key
  moleculeIndex?: number; // For grid positioning: which molecule this is relative to
  subOrder?: number; // For standalone cards: position within the "layer" after a molecule
  moleculeId?: string;
  moleculeTitle?: string;
  cardId?: string;
  cardData?: LayoutCard;
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
  'correlation': 'Agent Correlation',
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

/**
 * Creates a unified array of molecule containers and standalone cards for rendering
 * Uses a grid approach where:
 * - Each molecule has index 0, 1, 2, ...
 * - Standalone cards after molecule N have moleculeIndex: N
 * - Standalone cards are rendered after their target molecule
 * - Order calculation: (moleculeIndex * 1000) + subOrder
 * - Only active molecules (isActive !== false) show their container
 * - CRITICAL: All positions are preserved - inactive molecules leave a "slot" 
 *   so that subsequent molecules and cards stay in their original positions
 */
export const buildUnifiedRenderArray = (
  workflowMolecules: WorkflowMolecule[],
  layoutCards: LayoutCard[]
): UnifiedRenderItem[] => {
  const result: UnifiedRenderItem[] = [];
  
  // Separate cards
  const standaloneCards = layoutCards.filter(card => !card.moleculeId);
  
  // Find active molecules (for beforeMoleculeId checks)
  const activeMolecules = workflowMolecules.filter(m => m.isActive !== false);
  const activeMoleculeIds = new Set(activeMolecules.map(m => m.moleculeId));
  
  console.log('🔍 [buildUnifiedRenderArray] Starting build:', {
    totalMolecules: workflowMolecules.length,
    activeMolecules: activeMolecules.length,
    totalStandaloneCards: standaloneCards.length,
    molecules: workflowMolecules.map((m, idx) => ({
      index: idx,
      id: m.moleculeId,
      title: m.moleculeTitle,
      isActive: m.isActive !== false,
      order: idx * 1000
    })),
    standaloneCards: standaloneCards.map(c => ({
      id: c.id,
      order: c.order,
      beforeMoleculeId: c.beforeMoleculeId,
      afterMoleculeId: c.afterMoleculeId,
      moleculeIndex: c.order !== undefined ? Math.floor(c.order / 1000) : 'none',
      subOrder: c.order !== undefined ? c.order % 1000 : 'none'
    }))
  });
  
  // FIX: Handle cards that should appear BEFORE the first active molecule
  // These cards have beforeMoleculeId pointing to the first active molecule (index 0)
  // or order = 0 with no afterMoleculeId
  const cardsBeforeFirstMolecule = standaloneCards.filter(card => {
    // Check if card has beforeMoleculeId pointing to first active molecule
    if (card.beforeMoleculeId && activeMolecules.length > 0) {
      const firstActiveMolecule = activeMolecules[0];
      if (card.beforeMoleculeId === firstActiveMolecule.moleculeId) {
        // Also check if order is 0 (before first molecule)
        const cardOrder = typeof card.order === 'number' ? card.order : -1;
        if (cardOrder === 0 || !card.afterMoleculeId) {
          return true;
        }
      }
    }
    // Check if order is 0 and no afterMoleculeId (should be before first)
    if (card.order === 0 && !card.afterMoleculeId) {
      return true;
    }
    return false;
  });
  
  // Sort cards before first molecule by subOrder
  cardsBeforeFirstMolecule.sort((a, b) => {
    const subOrderA = a.order !== undefined ? a.order % 1000 : 0;
    const subOrderB = b.order !== undefined ? b.order % 1000 : 0;
    return subOrderA - subOrderB;
  });
  
  // Add cards before first molecule with negative order (so they appear before molecule at order 0)
  cardsBeforeFirstMolecule.forEach((standalone, index) => {
    result.push({
      type: 'standalone-card',
      order: -1 - index, // Negative order to appear before molecule at order 0
      moleculeIndex: -1, // Special marker for "before first molecule"
      subOrder: standalone.order !== undefined ? standalone.order % 1000 : index,
      cardId: standalone.id,
      cardData: standalone
    });
    
    console.log(`  ✅ Added standalone card BEFORE first molecule:`, {
      cardId: standalone.id,
      beforeMoleculeId: standalone.beforeMoleculeId,
      order: standalone.order,
      renderOrder: -1 - index,
      position: `before first active molecule`
    });
  });
  
  // Process ALL molecules (both active and inactive) in order
  // This preserves the absolute position of every element:
  // - Active molecules render at their original order
  // - Inactive molecules don't render, but their "slot" is preserved
  // - Standalone cards always render at their original order (based on moleculeIndex)
  // This means m2 will always be at order 1000, m3 at 2000, etc., regardless of m1's state
  workflowMolecules.forEach((molecule, moleculeIndex) => {
    const isActive = molecule.isActive !== false;
    const moleculeOrder = moleculeIndex * 1000;
    
    console.log(`📦 [buildUnifiedRenderArray] Processing molecule index ${moleculeIndex}:`, {
      moleculeId: molecule.moleculeId,
      moleculeTitle: molecule.moleculeTitle,
      isActive,
      order: moleculeOrder,
      willRenderContainer: isActive
    });
    
    // Only add molecule container if molecule is active
    // If inactive, we skip the container but preserve the order position
    // (standalone cards below it will still use this moleculeIndex for their order)
    if (isActive) {
      result.push({
        type: 'molecule-container',
        order: moleculeOrder, // Absolute position based on original molecule index
        moleculeIndex: moleculeIndex,
        moleculeId: molecule.moleculeId,
        moleculeTitle: molecule.moleculeTitle
      });
      console.log(`  ✅ Added molecule container at order ${moleculeOrder}`);
    } else {
      console.log(`  ⏭️ Skipped inactive molecule container (slot preserved for standalone cards)`);
    }
    // Note: If inactive, we don't add the container, but the moleculeIndex position
    // is still "reserved" - standalone cards below it use this index for their order
    
    // Find standalone cards that should appear after this molecule
    // Works for both active and inactive molecules
    // Cards reference the original moleculeIndex, so they stay in the same position
    // CRITICAL: We must preserve the EXACT original order value from the card
    // EXCEPT: Skip cards that are already placed before the first molecule
    const placedCardIds = new Set(result.map(r => r.cardId));
    const cardsAfterThisMolecule = standaloneCards.filter(card => {
      // Skip if already placed before first molecule
      if (placedCardIds.has(card.id)) {
        return false;
      }
      // Parse the order field to determine moleculeIndex
      // BUT: Skip cards with order = 0 that should be before first molecule
      if (card.order !== undefined && typeof card.order === 'number') {
        // Skip cards that are before first molecule (order = 0, no afterMoleculeId, beforeMoleculeId = first active)
        if (card.order === 0 && !card.afterMoleculeId) {
          if (card.beforeMoleculeId && activeMolecules.length > 0 && card.beforeMoleculeId === activeMolecules[0].moleculeId) {
            return false; // Already handled above
          }
        }
        const cardMoleculeIndex = Math.floor(card.order / 1000);
        return cardMoleculeIndex === moleculeIndex;
      }
      return false;
    });
    
    console.log(`  🔎 Found ${cardsAfterThisMolecule.length} standalone cards after molecule ${moleculeIndex}:`, 
      cardsAfterThisMolecule.map(c => ({
        cardId: c.id,
        originalOrder: c.order,
        calculatedMoleculeIndex: c.order !== undefined ? Math.floor(c.order / 1000) : 'none',
        subOrder: c.order !== undefined ? c.order % 1000 : 'none'
      }))
    );
    
    // Sort by subOrder (if exists, otherwise use 0)
    cardsAfterThisMolecule.sort((a, b) => {
      const subOrderA = a.order !== undefined ? a.order % 1000 : 0;
      const subOrderB = b.order !== undefined ? b.order % 1000 : 0;
      return subOrderA - subOrderB;
    });
    
    // Add standalone cards after this molecule at their ORIGINAL order position
    // CRITICAL: Use the card's original order value directly - don't recalculate it
    // This ensures atoms below m1 (order 1-999) stay at order 1-999, not 1001-1999
    cardsAfterThisMolecule.forEach((standalone) => {
      // Preserve the exact original order - don't recalculate using moleculeIndex
      // The card's order already contains the correct absolute position
      const originalOrder = standalone.order!;
      const subOrder = originalOrder % 1000;
      
      result.push({
        type: 'standalone-card',
        order: originalOrder, // Use original order directly - already correct
        moleculeIndex: moleculeIndex,
        subOrder,
        cardId: standalone.id,
        cardData: standalone
      });
      
      console.log(`  ✅ Added standalone card:`, {
        cardId: standalone.id,
        originalOrder,
        moleculeIndex,
        subOrder,
        position: `after molecule ${moleculeIndex} (${molecule.moleculeTitle || molecule.moleculeId})`
      });
    });
  });
  
  // Handle standalone cards without a proper order (orphans - append to end)
  const placedStandaloneIds = new Set(result.filter(r => r.type === 'standalone-card').map(r => r.cardId));
  const orphanCards = standaloneCards.filter(card => !placedStandaloneIds.has(card.id));
  
  // Place orphans after the last molecule (use last molecule index)
  // This ensures they appear after all molecules, maintaining position consistency
  const lastMoleculeIndex = workflowMolecules.length > 0 ? workflowMolecules.length - 1 : 0;
  
  orphanCards.forEach((standalone, cardIndex) => {
    result.push({
      type: 'standalone-card',
      order: (lastMoleculeIndex * 1000) + cardIndex + 1000, // After last molecule
      moleculeIndex: lastMoleculeIndex,
      subOrder: cardIndex + 1000,
      cardId: standalone.id,
      cardData: standalone
    });
  });
  
  // Sort by order to ensure correct rendering order
  // This maintains absolute positions: m2 is always at 1000, m3 at 2000, etc.
  // Cards before first molecule have negative order, so they appear first
  const sorted = result.sort((a, b) => a.order - b.order);
  
  console.log('📊 [buildUnifiedRenderArray] Final sorted render order:', 
    sorted.map(item => ({
      type: item.type,
      order: item.order,
      moleculeId: item.moleculeId,
      moleculeTitle: item.moleculeTitle,
      cardId: item.cardId,
      moleculeIndex: item.moleculeIndex,
      subOrder: item.subOrder,
      position: `${item.type === 'molecule-container' ? 'Molecule' : 'Standalone Card'} at order ${item.order}`
    }))
  );
  
  return sorted;
};
