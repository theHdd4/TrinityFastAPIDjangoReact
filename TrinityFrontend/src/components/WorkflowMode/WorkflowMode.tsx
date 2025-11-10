
import React, { useState, useCallback, useEffect } from 'react';
import { safeStringify } from '@/utils/safeStringify';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Play, Save, Share2, Upload, ChevronLeft, ChevronRight, Grid3X3, AlertTriangle } from 'lucide-react';
import Header from '@/components/Header';
import WorkflowCanvas from './components/WorkflowCanvas';
import MoleculeList from '@/components/MoleculeList/MoleculeList';
import WorkflowRightPanel from './components/WorkflowRightPanel';
import CreateMoleculeDialog from './components/CreateMoleculeDialog';
import { useToast } from '@/hooks/use-toast';
import { MOLECULES_API, LABORATORY_PROJECT_STATE_API } from '@/lib/api';
import { ReactFlowProvider } from 'reactflow';
import { convertWorkflowMoleculesToLaboratoryCards } from '../LaboratoryMode/components/CanvasArea/helpers';
import { LayoutCard, DroppedAtom } from '../LaboratoryMode/store/laboratoryStore';
import { atoms as allAtoms } from '@/components/AtomList/data';
import { getActiveProjectContext } from '@/utils/projectEnv';
import ConfirmationDialog from '@/templates/DialogueBox/ConfirmationDialog';
import './WorkflowMode.css';

interface SelectedAtom {
  atomName: string;
  moleculeId: string;
  moleculeTitle: string;
  order: number;
}

const WorkflowMode = () => {
  const [selectedMoleculeId, setSelectedMoleculeId] = useState<string>();
  const [canvasMolecules, setCanvasMolecules] = useState<any[]>([]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [customMolecules, setCustomMolecules] = useState<Array<{ id: string; title: string; atoms: string[] }>>([]);
  // Standalone atoms mirrored from Laboratory Mode (for chip display)
  // New structure: Uses explicit molecule references (betweenMolecules, afterLastMolecule)
  // Legacy: position field kept for backward compatibility
  const [standaloneCards, setStandaloneCards] = useState<Array<{ 
    id: string; 
    atomId: string; 
    title: string; 
    // Order field for sorting (moleculeIndex * 1000 + subOrder)
    order?: number;
    // New explicit molecule references
    betweenMolecules?: [string, string]; // [moleculeId1, moleculeId2] - atom is between these two molecules
    afterLastMolecule?: boolean; // true if atom is after the last molecule
    beforeFirstMolecule?: boolean; // true if atom is before the first molecule
    afterMoleculeId?: string; // convenience field: molecule ID this atom comes after
    beforeMoleculeId?: string; // convenience field: molecule ID this atom comes before
    // Legacy: position field for backward compatibility
    position?: number;
  }>>([]);
  const [isLibraryVisible, setIsLibraryVisible] = useState(true);
  const [isRightPanelVisible, setIsRightPanelVisible] = useState(true);
  const [isAtomLibraryVisible, setIsAtomLibraryVisible] = useState(false);
  const [isRightPanelToolVisible, setIsRightPanelToolVisible] = useState(false);
  const [workflowName, setWorkflowName] = useState<string>('Untitled Workflow');
  const [clearConfirmDialogOpen, setClearConfirmDialogOpen] = useState(false);
  // FIX: Add confirmation dialogs for atom and molecule removal
  const [atomRemoveConfirmDialogOpen, setAtomRemoveConfirmDialogOpen] = useState(false);
  const [moleculeRemoveConfirmDialogOpen, setMoleculeRemoveConfirmDialogOpen] = useState(false);
  const [pendingAtomRemoval, setPendingAtomRemoval] = useState<{ atomId: string; moleculeId: string } | null>(null);
  const [pendingMoleculeRemoval, setPendingMoleculeRemoval] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  // Save workflow state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('workflow-canvas-molecules', JSON.stringify(canvasMolecules));
  }, [canvasMolecules]);

  useEffect(() => {
    localStorage.setItem('workflow-custom-molecules', JSON.stringify(customMolecules));
  }, [customMolecules]);

  useEffect(() => {
    localStorage.setItem('workflow-standalone-cards', JSON.stringify(standaloneCards));
  }, [standaloneCards]);

  useEffect(() => {
    localStorage.setItem('workflow-name', workflowName);
  }, [workflowName]);

  const handleMoleculeSelect = (moleculeId: string) => {
    setSelectedMoleculeId(moleculeId);
  };

  const toggleLibraryVisibility = () => {
    setIsLibraryVisible(!isLibraryVisible);
  };

  const toggleRightPanelVisibility = () => {
    setIsRightPanelVisible(!isRightPanelVisible);
  };

  const handleAtomLibraryVisibilityChange = (isVisible: boolean) => {
    setIsAtomLibraryVisible(isVisible);
  };

  const handleRightPanelToolVisibilityChange = (isVisible: boolean) => {
    setIsRightPanelToolVisible(isVisible);
  };

  const handleCanvasMoleculesUpdate = useCallback((molecules: any[]) => {
      setCanvasMolecules(molecules);
  }, []);

  const handleMoleculeReplace = (oldId: string, newMolecule: any) => {
    setCanvasMolecules(prev => 
      prev.map(mol => 
        mol.id === oldId
          ? {
              ...mol,
              id: newMolecule.id,
              type: newMolecule.type || 'qm',
              title: newMolecule.title,
              subtitle: newMolecule.subtitle || '',
              tag: newMolecule.tag || '',
              atoms: newMolecule.atoms || [],
              selectedAtoms: {},
              atomOrder: newMolecule.atoms || [],
              containedMolecules: undefined,
              position: mol.position // Preserve the existing position
            }
          : mol
      )
    );
    
    console.log(`✅ Replaced molecule "${oldId}" with "${newMolecule.title}" in canvasMolecules`);
  };

  const handleMoleculeAdd = (moleculeData: any) => {
    // Add the molecule to canvasMolecules with its position preserved
    // Preserve isAICreated flag if it exists
    const enrichedMoleculeData = {
      ...moleculeData,
      isAICreated: moleculeData.isAICreated ?? false
    };
    setCanvasMolecules(prev => [...prev, enrichedMoleculeData]);
    console.log(`✅ Added molecule "${moleculeData.title}" to canvasMolecules with position:`, moleculeData.position, 'isAICreated:', enrichedMoleculeData.isAICreated);
  };

  const handleMoleculePositionsUpdate = (positions: { moleculeId: string; position: { x: number; y: number } }[]) => {
    // Update canvasMolecules with new positions
    setCanvasMolecules(prev => 
      prev.map(molecule => {
        const positionUpdate = positions.find(pos => pos.moleculeId === molecule.id);
        if (positionUpdate) {
          return {
            ...molecule,
            position: positionUpdate.position
          };
        }
        return molecule;
      })
    );
    console.log('✅ Updated molecule positions:', positions);
  };

  const handleAtomOrderChange = useCallback((moleculeId: string, newOrder: string[]) => {
    const nextOrder = Array.isArray(newOrder) ? [...newOrder] : [];

    setCanvasMolecules(prev =>
      prev.map(mol =>
        mol.id === moleculeId
          ? {
              ...mol,
              atomOrder: [...nextOrder],
              atoms: [...nextOrder]
            }
          : mol
      )
    );

    setCustomMolecules(prev =>
      prev.map(mol =>
        mol.id === moleculeId
          ? {
              ...mol,
              atomOrder: [...nextOrder],
              atoms: [...nextOrder]
            }
          : mol
      )
    );
  }, []);

  const handleInsertMolecule = (referenceMoleculeId: string, position: 'left' | 'right') => {
    // Generate numbered name automatically
    const existingNewMolecules = canvasMolecules.filter(m => 
      m.title === 'New Molecule' || m.title.startsWith('New Molecule ')
    );
    const nextNumber = existingNewMolecules.length + 1;
    const finalName = `New Molecule ${nextNumber}`;
    
    // Generate molecule ID in format: molecule_name-number
    const moleculeName = finalName.toLowerCase().replace(/\s+/g, '-');
    const moleculeId = `${moleculeName}-${nextNumber}`;

    const newMolecule = {
      id: moleculeId,
      type: 'custom',
      title: finalName,
      subtitle: '',
      tag: '',
      atoms: [],
      position: { x: 0, y: 0 }, // Will be recalculated by WorkflowCanvas
      connections: [],
      selectedAtoms: {},
      atomOrder: [],
      containedMolecules: []
    };
    
    setCustomMolecules(prev => [...prev, newMolecule]);
    
    // Find the index of the reference molecule
    const referenceIndex = canvasMolecules.findIndex(m => m.id === referenceMoleculeId);
    
    if (referenceIndex === -1) {
      // Reference molecule not found, just append
      setCanvasMolecules(prev => [...prev, newMolecule]);
      console.log(`✅ Inserted molecule "${finalName}" (reference not found, appended)`);
      return;
    }
    
    // When inserting to the RIGHT of a molecule, we need to check if there are standalone chips
    // that should appear immediately after this molecule. If so, the new molecule should be
    // inserted BEFORE those chips (so it appears right after the reference molecule).
    // 
    // When inserting to the LEFT, we need to check if there are standalone chips that should
    // appear immediately before this molecule. If so, the new molecule should be inserted
    // AFTER those chips (so it appears right before the reference molecule).
    let insertIndex: number;
    let chipsAfterReference: typeof standaloneCards = [];
    let chipsBeforeReference: typeof standaloneCards = [];
    
    if (position === 'left') {
      // Insert to the LEFT of the reference molecule
      // Check if there are standalone chips that should appear immediately before this molecule
      // Chips with betweenMolecules where the second molecule is the reference
      // OR chips with beforeMoleculeId matching the reference
      // OR chips with beforeFirstMolecule if reference is the first ACTIVE molecule
      const activeMolecules = canvasMolecules.filter(mol => mol.isActive !== false);
      const referenceActiveIndex = activeMolecules.findIndex(mol => mol.id === referenceMoleculeId);
      const isReferenceFirstActive = referenceActiveIndex === 0;
      
      chipsBeforeReference = standaloneCards.filter(chip => {
        // Chip is between previous molecule and reference
        if (chip.betweenMolecules && Array.isArray(chip.betweenMolecules) && chip.betweenMolecules.length === 2) {
          return chip.betweenMolecules[1] === referenceMoleculeId;
        }
        // Chip is before the reference molecule
        if (chip.beforeMoleculeId === referenceMoleculeId) {
          return true;
        }
        // Chip is before first molecule and reference is the first ACTIVE molecule
        if (chip.beforeFirstMolecule && isReferenceFirstActive) {
          return true;
        }
        return false;
      });
      
      if (chipsBeforeReference.length > 0) {
        // There are chips that should appear immediately before the reference molecule
        // Insert the new molecule right before the reference (at referenceIndex)
        // Chips will be updated to reference the new molecule (beforeMoleculeId: newMoleculeId)
        // So the visual order will be: chips, NEW_MOLECULE, reference
        insertIndex = referenceIndex;
        console.log(`📍 Inserting "${finalName}" before "${canvasMolecules[referenceIndex]?.title}" (${chipsBeforeReference.length} standalone chips will be updated to reference new molecule)`);
      } else {
        // No chips immediately before reference - insert normally
        insertIndex = referenceIndex;
      }
    } else {
      // Insert to the RIGHT of the reference molecule
      // Check if there are standalone chips that should appear immediately after this molecule
      // Chips with betweenMolecules where the first molecule is the reference
      // OR chips with afterMoleculeId matching the reference (and not afterLastMolecule)
      // OR chips with afterLastMolecule: true (if reference is the last molecule)
      const isLastMolecule = referenceIndex === canvasMolecules.length - 1;
      chipsAfterReference = standaloneCards.filter(chip => {
        // Chip is between reference and another molecule
        if (chip.betweenMolecules && Array.isArray(chip.betweenMolecules) && chip.betweenMolecules.length === 2) {
          return chip.betweenMolecules[0] === referenceMoleculeId;
        }
        // Chip is after the reference molecule (and not after last molecule)
        if (chip.afterMoleculeId === referenceMoleculeId && !chip.afterLastMolecule) {
          return true;
        }
        // Chip is after last molecule (if reference is the last molecule)
        if (chip.afterLastMolecule && isLastMolecule) {
          return true;
        }
        return false;
      });
      
      if (chipsAfterReference.length > 0) {
        // There are chips that should appear immediately after the reference molecule
        // Insert the new molecule right after the reference (before the chips)
        // The chips will still be positioned after the reference, but will appear after the new molecule visually
        // because WorkflowCanvas places chips after molecules based on their afterIndex
        // So the visual order will be: reference, NEW_MOLECULE, chips, next molecule
        insertIndex = referenceIndex + 1;
        console.log(`📍 Inserting "${finalName}" after "${canvasMolecules[referenceIndex]?.title}" (${chipsAfterReference.length} standalone chips will follow)`);
      } else {
        // No chips immediately after reference - insert normally
        insertIndex = referenceIndex + 1;
      }
    }
    
    // Insert the new molecule at the calculated index
    setCanvasMolecules(prev => {
      const newMolecules = [...prev];
      newMolecules.splice(insertIndex, 0, newMolecule);
      return newMolecules;
    });
    
    // Update standalone chips that reference molecules around the insertion point
    // When updating chips, we need to use the active molecules list BEFORE insertion
    // (since the new molecule hasn't been inserted in the active list yet)
    // So we compute active molecules from the current canvasMolecules state
    const activeMoleculesBeforeInsertion = canvasMolecules.filter(mol => mol.isActive !== false);
    
    if (position === 'right' && chipsAfterReference.length > 0) {
      const isLastMolecule = referenceIndex === canvasMolecules.length - 1;
      // When INSERTING (not creating), the new molecule should appear BEFORE standalone chips
      // So chips that were "after last molecule" should now be "after NEW_MOLECULE" (which becomes the new last)
      setStandaloneCards(prev => prev.map(chip => {
        // Update chips that were after last molecule (if reference is the last molecule)
        if (chip.afterLastMolecule && isLastMolecule) {
          // Chip should now be after NEW_MOLECULE (which becomes the new last molecule)
          // Keep afterLastMolecule: true, but update afterMoleculeId to point to new molecule
          return {
            ...chip,
            afterMoleculeId: moleculeId, // Update to point to new molecule (which will be the new last)
            // Keep afterLastMolecule: true (will be updated by sync logic)
            // Clear betweenMolecules if it exists
            betweenMolecules: undefined,
            beforeMoleculeId: undefined
          };
        }
        // Update chips that were between reference and another molecule
        if (chip.betweenMolecules && Array.isArray(chip.betweenMolecules) && chip.betweenMolecules.length === 2) {
          const [firstId, secondId] = chip.betweenMolecules;
          if (firstId === referenceMoleculeId) {
            // This chip was between reference and secondId
            // Update to be between NEW_MOLECULE and secondId
            return {
              ...chip,
              betweenMolecules: [moleculeId, secondId] as [string, string],
              afterMoleculeId: moleculeId,
              beforeMoleculeId: secondId
            };
          }
        }
        // Update chips that were after reference (not after last)
        if (chip.afterMoleculeId === referenceMoleculeId && !chip.afterLastMolecule) {
          // Find the next molecule after reference (which will be after newMolecule now)
          const nextMoleculeIndex = referenceIndex + 1; // Before insertion, next was at referenceIndex + 1
          const nextMolecule = canvasMolecules[nextMoleculeIndex];
          if (nextMolecule) {
            // Chip should now be between NEW_MOLECULE and nextMolecule
            return {
              ...chip,
              betweenMolecules: [moleculeId, nextMolecule.id] as [string, string],
              afterMoleculeId: moleculeId,
              beforeMoleculeId: nextMolecule.id
            };
          }
        }
        return chip;
      }));
      console.log(`🔄 Updated ${chipsAfterReference.length} standalone chip references: chips remain after last molecule (now NEW_MOLECULE)`);
    } else if (position === 'left' && chipsBeforeReference.length > 0) {
      // Chips that were "between previousMolecule and reference" should now be "between previousMolecule and NEW_MOLECULE"
      setStandaloneCards(prev => prev.map(chip => {
        // Update chips that were between previous molecule and reference
        if (chip.betweenMolecules && Array.isArray(chip.betweenMolecules) && chip.betweenMolecules.length === 2) {
          const [firstId, secondId] = chip.betweenMolecules;
          if (secondId === referenceMoleculeId) {
            // This chip was between firstId and reference
            // Update to be between firstId and NEW_MOLECULE
            return {
              ...chip,
              betweenMolecules: [firstId, moleculeId] as [string, string],
              afterMoleculeId: firstId,
              beforeMoleculeId: moleculeId
            };
          }
        }
        // Update chips that were before reference
        // When inserting LEFT of reference, chips should now be before NEW_MOLECULE
        // This ensures: chips, NEW_MOLECULE, reference (M2)
        if (chip.beforeMoleculeId === referenceMoleculeId) {
          // Find the previous ACTIVE molecule before reference (not just array neighbor)
          // Use activeMoleculesBeforeInsertion (computed before molecule insertion)
          const referenceActiveIndex = activeMoleculesBeforeInsertion.findIndex(mol => mol.id === referenceMoleculeId);
          const previousActiveMolecule = referenceActiveIndex > 0 ? activeMoleculesBeforeInsertion[referenceActiveIndex - 1] : null;
          const isReferenceFirstActive = referenceActiveIndex === 0;
          
          if (previousActiveMolecule) {
            // There's a previous active molecule - chip should be between previousActiveMolecule and NEW_MOLECULE
            // This ensures: previousActiveMolecule, chips, NEW_MOLECULE, reference
              return {
                ...chip,
              betweenMolecules: [previousActiveMolecule.id, moleculeId] as [string, string],
              afterMoleculeId: previousActiveMolecule.id,
              beforeMoleculeId: moleculeId,
              beforeFirstMolecule: false
            };
          } else {
            // Reference is the first active molecule - chip should now be before NEW_MOLECULE (which becomes first active)
            // This ensures: chips, NEW_MOLECULE, reference
            return {
              ...chip,
              beforeFirstMolecule: true,
              beforeMoleculeId: moleculeId,
              betweenMolecules: undefined,
              afterMoleculeId: undefined
            };
          }
        }
        // Update chips that were before first molecule (and reference is first active)
        // Check if reference is the first ACTIVE molecule, not just array index 0
        if (chip.beforeFirstMolecule) {
          // Use activeMoleculesBeforeInsertion (computed before molecule insertion)
          const referenceActiveIndex = activeMoleculesBeforeInsertion.findIndex(mol => mol.id === referenceMoleculeId);
          const isReferenceFirstActive = referenceActiveIndex === 0;
          
          if (isReferenceFirstActive) {
            // Chip should now be before NEW_MOLECULE (which becomes first active)
          return {
            ...chip,
            beforeFirstMolecule: true,
            beforeMoleculeId: moleculeId
          };
          }
        }
        return chip;
      }));
      console.log(`🔄 Updated ${chipsBeforeReference.length} standalone chip references to position before new molecule "${finalName}"`);
    }
    
    console.log(`✅ Inserted molecule "${finalName}" ${position} of "${canvasMolecules[referenceIndex]?.title || referenceMoleculeId}" at index ${insertIndex}`);
    
    toast({
      title: 'Molecule Inserted',
      description: `"${finalName}" has been inserted ${position === 'left' ? 'before' : 'after'} "${canvasMolecules[referenceIndex]?.title || 'molecule'}"`
    });
  };

  const handleCreateMolecule = () => {
    // Generate numbered name automatically
    const existingNewMolecules = canvasMolecules.filter(m => 
      m.title === 'New Molecule' || m.title.startsWith('New Molecule ')
    );
    const nextNumber = existingNewMolecules.length + 1;
    const finalName = `New Molecule ${nextNumber}`;
    
    // Generate molecule ID in format: molecule_name-number
    const moleculeName = finalName.toLowerCase().replace(/\s+/g, '-');
    const moleculeId = `${moleculeName}-${nextNumber}`;

    const newMolecule = {
      id: moleculeId,
      title: finalName,
      atoms: []
    };
    setCustomMolecules(prev => [...prev, newMolecule]);
    
      // Created molecules act as containers - no auto-connection needed
    
    // Calculate flexible position for new molecule
    const getFlexiblePosition = () => {
      const moleculesCount = canvasMolecules.length;
      const moleculesPerRow = 4; // Maximum molecules per row
      const moleculeWidth = 280; // Width of each molecule card
      const moleculeHeight = 220; // Height of each molecule card
      const padding = 60; // Padding around molecules
      
      const row = Math.floor(moleculesCount / moleculesPerRow);
      const col = moleculesCount % moleculesPerRow;
      
      return {
        x: padding + (col * moleculeWidth), // No extra spacing, molecules will be closer
        y: padding + (row * moleculeHeight) // No extra spacing between rows
      };
    };
    
    // Add molecule to canvas as container
    const canvasMolecule = {
      id: newMolecule.id,
      type: 'custom',
      title: finalName,
      subtitle: '',
      tag: '',
      atoms: [],
      position: getFlexiblePosition(),
      connections: [], // No auto-connection - acts as container
      selectedAtoms: {},
      atomOrder: [],
      containedMolecules: [] // NEW: Track molecules inside this container
    };
    
    // When CREATING (adding) a new molecule, it should appear AFTER standalone chips
    // So we need to update chips that were afterLastMolecule to be between last molecule and new molecule
    const activeMolecules = canvasMolecules.filter(mol => mol.isActive !== false);
    const lastMolecule = activeMolecules.length > 0 ? activeMolecules[activeMolecules.length - 1] : null;
    const atomsAfterLast = standaloneCards.filter(chip => chip.afterLastMolecule);
    
    if (atomsAfterLast.length > 0 && lastMolecule) {
      // Update atoms that were after last molecule to be between last molecule and new molecule
      // This ensures: M1, chips, NEW_M2 (new molecule appears after chips)
      setStandaloneCards(prev => prev.map(chip => {
        if (chip.afterLastMolecule) {
          return {
            ...chip,
            betweenMolecules: [lastMolecule.id, moleculeId] as [string, string],
            afterMoleculeId: lastMolecule.id,
            beforeMoleculeId: moleculeId,
            afterLastMolecule: false // No longer after last molecule
          };
        }
        return chip;
      }));
      console.log(`🔄 Updated ${atomsAfterLast.length} standalone atoms from "after last molecule" to "between last molecule and new molecule" (CREATE)`);
    }
    
    setCanvasMolecules(prev => [...prev, canvasMolecule]);
    
    console.log(`✅ Created new container molecule "${finalName}" - ready to accept QM and custom molecules`);
    
    toast({
      title: 'Molecule Created',
      description: `"${finalName}" has been created as a container molecule on the canvas.`
    });
  };

  const handleRenameMolecule = (moleculeId: string, newName: string) => {
    setCustomMolecules(prev => 
      prev.map(mol => 
        mol.id === moleculeId ? { ...mol, title: newName } : mol
      )
    );
    
    setCanvasMolecules(prev => 
      prev.map(mol => 
        mol.id === moleculeId ? { ...mol, title: newName } : mol
      )
    );
    
    toast({
      title: 'Molecule Renamed',
      description: `Molecule has been renamed to "${newName}"`
    });
  };

  const handleAtomAssignToMolecule = (atomId: string, moleculeId: string) => {
    // FIX: Allow duplicate atoms - remove the !atoms.includes(atomId) check
    // Users can now add the same atom multiple times to show multiple instances
    setCustomMolecules(prev => 
      prev.map(mol => {
        const atoms = Array.isArray(mol.atoms) ? mol.atoms : [];
        const atomOrder = Array.isArray(mol.atomOrder) ? mol.atomOrder : [];
        return mol.id === moleculeId
          ? { 
              ...mol, 
              atoms: [...atoms, atomId],
              atomOrder: [...atomOrder, atomId],
              selectedAtoms: { ...(mol.selectedAtoms || {}), [atomId]: false }
            }
          : mol;
      })
    );
    
    // Also update canvasMolecules to reflect the atom assignment
    setCanvasMolecules(prev => 
      prev.map(mol => {
        const atoms = Array.isArray(mol.atoms) ? mol.atoms : [];
        const atomOrder = Array.isArray(mol.atomOrder) ? mol.atomOrder : [];
        return mol.id === moleculeId
          ? { 
              ...mol, 
              atoms: [...atoms, atomId],
              atomOrder: [...atomOrder, atomId],
              selectedAtoms: { ...(mol.selectedAtoms || {}), [atomId]: false }
            }
          : mol;
      })
    );
  };

  const handleMultipleAtomsAssignToMolecule = (atomIds: string[], moleculeId: string) => {
    // FIX: Allow duplicate atoms - remove the filter that checks for existing atoms
    // Users can now add the same atom multiple times to show multiple instances
    const newAtomIds = atomIds; // Add all atoms, including duplicates
    
    setCustomMolecules(prev => 
      prev.map(mol => 
        mol.id === moleculeId
          ? { 
              ...mol, 
              atoms: [...(Array.isArray(mol.atoms) ? mol.atoms : []), ...newAtomIds],
              atomOrder: [...(Array.isArray(mol.atomOrder) ? mol.atomOrder : []), ...newAtomIds],
              selectedAtoms: { 
                ...(mol.selectedAtoms || {}), 
                ...newAtomIds.reduce((acc, id) => ({ ...acc, [id]: false }), {})
              }
            }
          : mol
      )
    );
    
    // Also update canvasMolecules to reflect the atom assignment
    setCanvasMolecules(prev => 
      prev.map(mol => 
        mol.id === moleculeId
          ? { 
              ...mol, 
              atoms: [...(Array.isArray(mol.atoms) ? mol.atoms : []), ...newAtomIds],
              atomOrder: [...(Array.isArray(mol.atomOrder) ? mol.atomOrder : []), ...newAtomIds],
              selectedAtoms: { 
                ...(mol.selectedAtoms || {}), 
                ...newAtomIds.reduce((acc, id) => ({ ...acc, [id]: false }), {})
              }
            }
          : mol
      )
    );
  };

  // Handle moving atom to different molecule
  const handleMoveAtomToMolecule = (atomId: string, fromMoleculeId: string, toMoleculeId: string) => {
    console.log('Moving atom:', atomId, 'from:', fromMoleculeId, 'to:', toMoleculeId);
    
    // Update customMolecules state
    setCustomMolecules(prev => 
      prev.map(mol => {
        if (mol.id === fromMoleculeId) {
          // Remove from source molecule
          const atoms = Array.isArray(mol.atoms) ? mol.atoms : [];
          const atomOrder = Array.isArray(mol.atomOrder) ? mol.atomOrder : [];
          return {
            ...mol,
            atoms: atoms.filter(id => id !== atomId),
            atomOrder: atomOrder.filter(id => id !== atomId),
            selectedAtoms: { ...(mol.selectedAtoms || {}), [atomId]: false }
          };
        } else if (mol.id === toMoleculeId) {
          // Add to target molecule only if it doesn't already exist
          const atoms = Array.isArray(mol.atoms) ? mol.atoms : [];
          const atomOrder = Array.isArray(mol.atomOrder) ? mol.atomOrder : [];
          if (!atoms.includes(atomId)) {
            return {
              ...mol,
              atoms: [...atoms, atomId],
              atomOrder: [...atomOrder, atomId],
              selectedAtoms: { ...(mol.selectedAtoms || {}), [atomId]: false }
            };
          }
        }
        return mol;
      })
    );
    
    // Update canvasMolecules state
    setCanvasMolecules(prev => 
      prev.map(mol => {
        if (mol.id === fromMoleculeId) {
          // Remove from source molecule
          console.log('Removing atom from source molecule:', mol.title);
          const atoms = Array.isArray(mol.atoms) ? mol.atoms : [];
          const atomOrder = Array.isArray(mol.atomOrder) ? mol.atomOrder : [];
          return {
            ...mol,
            atoms: atoms.filter(id => id !== atomId),
            atomOrder: atomOrder.filter(id => id !== atomId),
            selectedAtoms: { ...(mol.selectedAtoms || {}), [atomId]: false }
          };
        } else if (mol.id === toMoleculeId) {
          // Add to target molecule only if it doesn't already exist
          console.log('Adding atom to target molecule:', mol.title);
          const atoms = Array.isArray(mol.atoms) ? mol.atoms : [];
          const atomOrder = Array.isArray(mol.atomOrder) ? mol.atomOrder : [];
          if (!atoms.includes(atomId)) {
            return {
              ...mol,
              atoms: [...atoms, atomId],
              atomOrder: [...atomOrder, atomId],
              selectedAtoms: { ...(mol.selectedAtoms || {}), [atomId]: false }
            };
          }
        }
        return mol;
      })
    );

    toast({
      title: 'Atom Moved',
      description: `Atom has been moved to a different molecule`
    });
  };

  // Handle moving atom back to atom list - show confirmation dialog first
  const handleMoveAtomToAtomList = (atomId: string, fromMoleculeId: string) => {
    // Store pending removal data and show confirmation dialog
    setPendingAtomRemoval({ atomId, moleculeId: fromMoleculeId });
    setAtomRemoveConfirmDialogOpen(true);
  };

  // Actually perform atom removal after confirmation
  const performAtomRemoval = () => {
    if (!pendingAtomRemoval) return;
    
    const { atomId, moleculeId } = pendingAtomRemoval;
    console.log('Moving atom to atom list:', atomId, 'from molecule:', moleculeId);
    
    // Update customMolecules state
    setCustomMolecules(prev => 
      prev.map(mol => 
        mol.id === moleculeId
          ? {
              ...mol,
              atoms: (Array.isArray(mol.atoms) ? mol.atoms : []).filter(id => id !== atomId),
              atomOrder: (Array.isArray(mol.atomOrder) ? mol.atomOrder : []).filter(id => id !== atomId),
              selectedAtoms: { ...(mol.selectedAtoms || {}), [atomId]: false }
            }
          : mol
      )
    );
    
    // Update canvasMolecules state
    setCanvasMolecules(prev => 
      prev.map(mol => 
        mol.id === moleculeId
          ? {
              ...mol,
              atoms: (Array.isArray(mol.atoms) ? mol.atoms : []).filter(id => id !== atomId),
              atomOrder: (Array.isArray(mol.atomOrder) ? mol.atomOrder : []).filter(id => id !== atomId),
              selectedAtoms: { ...(mol.selectedAtoms || {}), [atomId]: false }
            }
          : mol
      )
    );

    // Clear pending removal and close dialog
    setPendingAtomRemoval(null);
    setAtomRemoveConfirmDialogOpen(false);

    toast({
      title: 'Atom Removed',
      description: `Atom has been removed. Changes will reflect in Laboratory Mode when you save.`
    });
  };

  // Handle molecule removal - show confirmation dialog first
  const handleMoleculeRemove = (moleculeId: string) => {
    // Store pending removal and show confirmation dialog
    setPendingMoleculeRemoval(moleculeId);
    setMoleculeRemoveConfirmDialogOpen(true);
  };

  // Actually perform molecule removal after confirmation
  const performMoleculeRemoval = () => {
    if (!pendingMoleculeRemoval) return;
    
    const moleculeId = pendingMoleculeRemoval;
    // Get the index of the molecule being deleted BEFORE marking it as inactive
    const deletedIndex = canvasMolecules.findIndex(mol => mol.id === moleculeId);
    
    // Find PREVIOUS and NEXT ACTIVE molecules (not just array neighbors)
    // This is critical because chips should reference active molecules, not inactive ones
    const activeMolecules = canvasMolecules.filter(mol => mol.isActive !== false);
    const deletedActiveIndex = activeMolecules.findIndex(mol => mol.id === moleculeId);
    
    // Find previous ACTIVE molecule (before deleted one in active list)
    let previousActiveMolecule: typeof activeMolecules[0] | null = null;
    if (deletedActiveIndex > 0) {
      previousActiveMolecule = activeMolecules[deletedActiveIndex - 1];
    }
    
    // Find next ACTIVE molecule (after deleted one in active list)
    let nextActiveMolecule: typeof activeMolecules[0] | null = null;
    if (deletedActiveIndex >= 0 && deletedActiveIndex < activeMolecules.length - 1) {
      nextActiveMolecule = activeMolecules[deletedActiveIndex + 1];
    }
    
    // Also get array neighbors for position checks (but prefer active molecules for chip references)
    const moleculeBeforeDeleted = deletedIndex > 0 ? canvasMolecules[deletedIndex - 1] : null;
    const moleculeAfterDeleted = deletedIndex < canvasMolecules.length - 1 ? canvasMolecules[deletedIndex + 1] : null;
    
    // Check if deleted molecule was the first or last active molecule
    const wasFirstActive = deletedActiveIndex === 0;
    const wasLastActive = deletedActiveIndex === activeMolecules.length - 1;
    
    // Mark as inactive instead of removing (preserves position to prevent m2 from taking m1's place)
    // Keep all molecules in state (active and inactive) - filtering happens only when rendering/displaying
    setCanvasMolecules(prev => prev.map(mol => 
      mol.id === moleculeId 
        ? { ...mol, isActive: false }
        : mol
    ));
    
    setCustomMolecules(prev => prev.map(mol => 
      mol.id === moleculeId 
        ? { ...mol, isActive: false }
        : mol
    ));
    
    console.log(`🗑️ Marked molecule ${moleculeId} as inactive (isActive: false) - position preserved in MongoDB`);
    console.log(`📊 Active molecule context: previous=${previousActiveMolecule?.id || 'none'}, next=${nextActiveMolecule?.id || 'none'}, wasFirst=${wasFirstActive}, wasLast=${wasLastActive}`);
    
    // Update standalone chips that reference the deleted molecule
    // Use ACTIVE molecules to ensure chips reference the correct molecules
    setStandaloneCards(prev => prev.map(card => {
      // Case 1: Chip is between two molecules and one is deleted
      if (card.betweenMolecules && Array.isArray(card.betweenMolecules)) {
        const [firstId, secondId] = card.betweenMolecules;
        
        if (firstId === moleculeId && secondId === moleculeId) {
          // Both references point to deleted molecule (edge case)
          // Remove the chip as it has no valid position
          return null;
        } else if (firstId === moleculeId) {
          // Deleted molecule was the first in betweenMolecules
          // Chip should be between previousActiveMolecule and secondId
          if (previousActiveMolecule && previousActiveMolecule.id !== secondId) {
            return {
              ...card,
              betweenMolecules: [previousActiveMolecule.id, secondId] as [string, string],
              afterMoleculeId: previousActiveMolecule.id,
              beforeMoleculeId: secondId
            };
          } else {
            // No active molecule before deleted one - place before secondId
            // If secondId is now the first active molecule, set beforeFirstMolecule
            if (wasFirstActive && nextActiveMolecule && nextActiveMolecule.id === secondId) {
              return {
                ...card,
                beforeFirstMolecule: true,
                beforeMoleculeId: secondId,
                betweenMolecules: undefined,
                afterMoleculeId: undefined
              };
            } else {
              return {
                ...card,
                beforeMoleculeId: secondId,
                betweenMolecules: undefined,
                afterMoleculeId: undefined,
                beforeFirstMolecule: false
              };
            }
          }
        } else if (secondId === moleculeId) {
          // Deleted molecule was the second in betweenMolecules
          // Chip should be between firstId and nextActiveMolecule
          if (nextActiveMolecule && nextActiveMolecule.id !== firstId) {
            return {
              ...card,
              betweenMolecules: [firstId, nextActiveMolecule.id] as [string, string],
              afterMoleculeId: firstId,
              beforeMoleculeId: nextActiveMolecule.id
            };
          } else {
            // No active molecule after deleted one - place after firstId
            return {
              ...card,
              afterLastMolecule: wasLastActive,
              afterMoleculeId: firstId,
              betweenMolecules: undefined,
              beforeMoleculeId: undefined
            };
          }
        }
      }
      
      // Case 2: Chip is after the deleted molecule (or has afterLastMolecule referencing deleted molecule)
      if (card.afterMoleculeId === moleculeId || (card.afterLastMolecule && card.afterMoleculeId === moleculeId)) {
        if (previousActiveMolecule) {
          // Chip should now be after the previous active molecule
          // If there's a next active molecule, it's between molecules
          if (nextActiveMolecule && nextActiveMolecule.id !== previousActiveMolecule.id) {
          return {
            ...card,
              betweenMolecules: [previousActiveMolecule.id, nextActiveMolecule.id] as [string, string],
              afterMoleculeId: previousActiveMolecule.id,
              beforeMoleculeId: nextActiveMolecule.id,
              afterLastMolecule: false
            };
          } else {
            // No next active molecule - it's after the last active molecule
            return {
              ...card,
              afterMoleculeId: previousActiveMolecule.id,
              afterLastMolecule: wasLastActive,
              betweenMolecules: undefined,
              beforeMoleculeId: undefined
            };
          }
        } else if (nextActiveMolecule) {
          // Deleted was first active molecule - chip should now be before the next active one
          return {
            ...card,
            beforeFirstMolecule: true,
            beforeMoleculeId: nextActiveMolecule.id,
            afterMoleculeId: undefined,
            afterLastMolecule: false,
            betweenMolecules: undefined
          };
        }
      }
      
      // Case 3: Chip is before the deleted molecule
      if (card.beforeMoleculeId === moleculeId) {
        if (nextActiveMolecule) {
          // Chip should now be before the next active molecule
          // Check if nextActiveMolecule is now the first active molecule (deleted was first active)
          const isNextFirstActive = wasFirstActive;
          
          // If chip was originally beforeFirstMolecule, it should remain beforeFirstMolecule
          // OR if there's no previous active molecule, it's before the first active molecule
          if (card.beforeFirstMolecule || isNextFirstActive) {
            // Chip should be before the first active molecule
          return {
            ...card,
              beforeFirstMolecule: true,
              beforeMoleculeId: nextActiveMolecule.id,
              betweenMolecules: undefined,
              afterMoleculeId: undefined
            };
          } else if (previousActiveMolecule && previousActiveMolecule.id !== nextActiveMolecule.id) {
            // There's a previous active molecule - chip is between molecules
            return {
              ...card,
              betweenMolecules: [previousActiveMolecule.id, nextActiveMolecule.id] as [string, string],
              afterMoleculeId: previousActiveMolecule.id,
              beforeMoleculeId: nextActiveMolecule.id,
              beforeFirstMolecule: false
          };
        } else {
            // No previous active molecule - it's before the first active molecule
            return {
              ...card,
              beforeFirstMolecule: isNextFirstActive,
              beforeMoleculeId: nextActiveMolecule.id,
              betweenMolecules: undefined,
              afterMoleculeId: undefined
            };
          }
        } else if (previousActiveMolecule) {
          // Deleted was last active molecule - chip should now be after the previous active one
          return {
            ...card,
            afterLastMolecule: true,
            afterMoleculeId: previousActiveMolecule.id,
            beforeMoleculeId: undefined,
            beforeFirstMolecule: false,
            betweenMolecules: undefined
          };
        }
      }
      
      // Case 4: Chip has beforeFirstMolecule flag but references deleted molecule
      if (card.beforeFirstMolecule && card.beforeMoleculeId === moleculeId && nextActiveMolecule) {
        // Chip should remain before first, but now points to the next active molecule
        return {
          ...card,
          beforeMoleculeId: nextActiveMolecule.id,
          beforeFirstMolecule: true
        };
      }
      
      // No references to deleted molecule - keep card as is
      return card;
    }).filter((card): card is NonNullable<typeof card> => card !== null)); // Remove null entries
    
    // Clear pending removal and close dialog
    setPendingMoleculeRemoval(null);
    setMoleculeRemoveConfirmDialogOpen(false);

    toast({
      title: 'Molecule Removed',
      description: 'Molecule has been removed. Changes will reflect in Laboratory Mode when you save.'
    });
  };

  const handleStandaloneCardRemove = (standaloneCardId: string) => {
    console.log('🗑️ Removing standalone card:', standaloneCardId);
    setStandaloneCards(prev => prev.filter(card => card.id !== standaloneCardId));
    toast({
      title: 'Standalone Card Removed',
      description: 'Standalone card has been removed from the canvas'
    });
  };

  // Helper function to check if canvas has any molecules
  const checkCanvasHasMolecules = useCallback(() => {
    return canvasMolecules.length > 0;
  }, [canvasMolecules]);

  // Helper function to get AI-created molecule IDs
  const getAICreatedMolecules = useCallback(() => {
    return canvasMolecules
      .filter(mol => mol.isAICreated === true)
      .map(mol => mol.id);
  }, [canvasMolecules]);

  // Helper function to clear only AI-created molecules
  const clearAICreatedMolecules = useCallback(() => {
    const beforeCount = canvasMolecules.length;
    setCanvasMolecules(prev => prev.filter(mol => mol.isAICreated !== true));
    setCustomMolecules(prev => prev.filter(mol => {
      const canvasMol = canvasMolecules.find(cm => cm.id === mol.id);
      return !canvasMol || canvasMol.isAICreated !== true;
    }));
    const afterCount = canvasMolecules.filter(mol => mol.isAICreated !== true).length;
    console.log(`🗑️ Cleared ${beforeCount - afterCount} AI-created molecules`);
  }, [canvasMolecules]);

  // Helper function to get rightmost molecule position
  const getRightmostMoleculePosition = useCallback(() => {
    if (canvasMolecules.length === 0) return 0;
    
    const moleculeWidth = 280;
    const rightmostMolecule = canvasMolecules.reduce((rightmost, mol) => {
      const molRight = (mol.position?.x || 0) + moleculeWidth;
      const rightmostRight = (rightmost.position?.x || 0) + moleculeWidth;
      return molRight > rightmostRight ? mol : rightmost;
    }, canvasMolecules[0]);
    
    return (rightmostMolecule.position?.x || 0) + moleculeWidth;
  }, [canvasMolecules]);

  // Handle molecule addition (for fetched molecules)


  // Handle workflow rendering to Laboratory mode
  const handleRenderWorkflow = useCallback(async () => {
    // Check if all molecules have at least one atom (only active molecules)
    const moleculesWithAtoms = canvasMolecules.filter(mol => mol.isActive !== false && mol.atoms && mol.atoms.length > 0);
    
    if (moleculesWithAtoms.length === 0) {
      toast({
        title: 'No Atoms Assigned',
        description: 'Please assign atoms to at least one molecule before rendering workflow',
        variant: 'destructive'
      });
      return;
    }

    const activeCanvasMolecules = canvasMolecules.filter(mol => mol.isActive !== false);
    if (moleculesWithAtoms.length !== activeCanvasMolecules.length) {
      toast({
        title: 'Incomplete Workflow',
        description: 'Some molecules don\'t have atoms assigned. Please assign atoms to all molecules.',
        variant: 'destructive'
      });
      return;
    }

    // Save workflow configuration to MongoDB before rendering
    try {
      console.log('💾 Saving workflow configuration to MongoDB before rendering...');
      const envStr = localStorage.getItem('env');
      const env = envStr ? JSON.parse(envStr) : {};
      const client_name = env.CLIENT_NAME || 'default_client';
      const app_name = env.APP_NAME || 'default_app';
      const project_name = env.PROJECT_NAME || 'default_project';
      
      // Save all molecules (active + inactive) to preserve isActive state
      await fetch(`${MOLECULES_API}/workflow/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          workflow_name: workflowName,
          canvas_molecules: canvasMolecules, // All molecules (active + inactive with isActive flag)
          custom_molecules: customMolecules, // All molecules (active + inactive with isActive flag)
          standalone_cards: standaloneCards,
          user_id: '',
          client_name: client_name,
          app_name: app_name,
          project_name: project_name
        })
      });
      console.log('✅ Workflow configuration saved to MongoDB successfully');
    } catch (error) {
      console.error('❌ Failed to save workflow configuration to MongoDB:', error);
      toast({
        title: 'Save Warning',
        description: 'Workflow will be rendered but configuration may not be saved to database',
        variant: 'destructive'
      });
    }

    // Function to convert atom names to atom IDs for Laboratory mode
    const convertAtomNameToId = (atomName: string) => {
      return atomName
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
    };

    // FIX 1: Use FULL molecule list (active + inactive) for consistent indexing
    // This ensures that moleculeIndex calculations match between Lab and Workflow modes
    // The full list preserves positions for inactive molecules (isActive: false)
    const allMoleculesForIndexing = canvasMolecules; // Includes both active and inactive
    const activeMoleculesForRendering = moleculesWithAtoms; // Only active molecules for rendering
    
    // Create a map of ALL molecule IDs to their indices in the FULL list (for consistent order calculation)
    const fullMoleculeIdToIndexMap = new Map<string, number>();
    allMoleculesForIndexing.forEach((mol, index) => {
      fullMoleculeIdToIndexMap.set(mol.id, index);
    });
    
    // Create a map of active molecule IDs to their indices in the active list (for rendering)
    const activeMoleculeIdToIndexMap = new Map<string, number>();
    activeMoleculesForRendering.forEach((mol, index) => {
      activeMoleculeIdToIndexMap.set(mol.id, index);
    });

    // Prepare workflow molecules in the format expected by the helper function
    // Use active molecules for rendering (only these have atoms)
    const workflowMolecules = activeMoleculesForRendering.map(mol => ({
        id: mol.id,
        title: mol.title,
      atoms: mol.atoms.map(atomName => convertAtomNameToId(atomName)),
      atomOrder: (mol.atomOrder || mol.atoms).map(atomName => convertAtomNameToId(atomName))
    }));

    console.log('🔄 Converting workflow molecules to Laboratory cards format...');
    console.log(`📊 Molecule indexing: ${allMoleculesForIndexing.length} total (${activeMoleculesForRendering.length} active, ${allMoleculesForIndexing.length - activeMoleculesForRendering.length} inactive)`);
    
    // Convert workflow molecules to Laboratory cards format
    const workflowCards = convertWorkflowMoleculesToLaboratoryCards(workflowMolecules);
    console.log('✅ Converted', workflowCards.length, 'workflow cards');

    // Convert standalone chips from Workflow Mode to Laboratory Mode cards format
    // LLM mapping for atoms that support AI agents (same as in helpers.ts)
    const LLM_MAP: Record<string, string> = {
      concat: 'Agent Concat',
      'chart-maker': 'Agent Chart Maker',
      merge: 'Agent Merge',
      'create-column': 'Agent Create Transform',
      'groupby-wtg-avg': 'Agent GroupBy',
      'explore': 'Agent Explore',
      'dataframe-operations': 'Agent DataFrame Operations',
    };

    const normalize = (s: string) => s.toLowerCase().replace(/[\s_-]/g, '');

    const standaloneCardsForLab: LayoutCard[] = standaloneCards.map((standaloneChip, chipIndex) => {
      // Find atom info
      const atomInfo = allAtoms.find(
        a =>
          normalize(a.id) === normalize(standaloneChip.atomId) ||
          normalize(a.title) === normalize(standaloneChip.atomId) ||
          normalize(a.title) === normalize(standaloneChip.title),
      ) || ({} as any);

      const resolvedAtomId = atomInfo.id || standaloneChip.atomId;

      // Create DroppedAtom
      const droppedAtom: DroppedAtom = {
        id: `${resolvedAtomId}-${Date.now()}-${Math.random()}-${chipIndex}`,
        atomId: resolvedAtomId,
        title: atomInfo.title || standaloneChip.title || standaloneChip.atomId,
        category: atomInfo.category || 'Atom',
        color: atomInfo.color || 'bg-gray-400',
        source: 'manual',
        llm: LLM_MAP[resolvedAtomId],
      };

      // Calculate order based on position relative to molecules
      // FIX 1: Use FULL molecule list for consistent indexing (accounts for inactive molecules)
      // Use grid approach: order = (moleculeIndex * 1000) + subOrder
      // moleculeIndex is based on FULL list position (including inactive molecules)
      let order: number | undefined;
      
      if (standaloneChip.betweenMolecules && Array.isArray(standaloneChip.betweenMolecules) && standaloneChip.betweenMolecules.length === 2) {
        // Between two molecules: place after the first molecule
        const [firstMoleculeId] = standaloneChip.betweenMolecules;
        // Use FULL molecule list index for consistent positioning
        const moleculeIndex = fullMoleculeIdToIndexMap.get(firstMoleculeId);
        if (moleculeIndex !== undefined) {
          // Find subOrder by counting existing standalone chips after this molecule
          const existingChipsAfterMolecule = standaloneCards
            .slice(0, chipIndex)
            .filter(chip => {
              if (chip.betweenMolecules && Array.isArray(chip.betweenMolecules) && chip.betweenMolecules[0] === firstMoleculeId) {
                return true;
              }
              return chip.afterMoleculeId === firstMoleculeId;
            }).length;
          order = (moleculeIndex * 1000) + (existingChipsAfterMolecule + 1);
        }
      } else if (standaloneChip.afterMoleculeId) {
        // After a specific molecule
        // Use FULL molecule list index for consistent positioning
        const moleculeIndex = fullMoleculeIdToIndexMap.get(standaloneChip.afterMoleculeId);
        if (moleculeIndex !== undefined) {
          if (standaloneChip.afterLastMolecule) {
            // After last molecule - use FULL list length
            order = (allMoleculesForIndexing.length * 1000) + chipIndex + 1;
          } else {
            // Between molecules: after this molecule, before the next
            const existingChipsAfterMolecule = standaloneCards
              .slice(0, chipIndex)
              .filter(chip => chip.afterMoleculeId === standaloneChip.afterMoleculeId && !chip.afterLastMolecule).length;
            order = (moleculeIndex * 1000) + (existingChipsAfterMolecule + 1);
          }
        }
      } else if (standaloneChip.beforeMoleculeId) {
        // Before a specific molecule: place after the previous molecule
        // Use FULL molecule list index for consistent positioning
        const moleculeIndex = fullMoleculeIdToIndexMap.get(standaloneChip.beforeMoleculeId);
        if (moleculeIndex !== undefined && moleculeIndex > 0) {
          const previousMoleculeIndex = moleculeIndex - 1;
          const existingChipsAfterPrevious = standaloneCards
            .slice(0, chipIndex)
            .filter(chip => {
              if (chip.afterMoleculeId) {
                // Use FULL list index for comparison
                const chipMoleculeIndex = fullMoleculeIdToIndexMap.get(chip.afterMoleculeId);
                return chipMoleculeIndex === previousMoleculeIndex;
              }
              return false;
            }).length;
          order = (previousMoleculeIndex * 1000) + (existingChipsAfterPrevious + 1);
        } else if (moleculeIndex === 0 && standaloneChip.beforeFirstMolecule) {
          // Before first molecule: use negative or 0 order
          order = chipIndex;
        }
      } else if (standaloneChip.beforeFirstMolecule) {
        // Before first molecule
        order = chipIndex;
      } else if (standaloneChip.afterLastMolecule) {
        // After last molecule - use FULL list length
        order = (allMoleculesForIndexing.length * 1000) + chipIndex + 1;
      } else if (typeof standaloneChip.position === 'number') {
        // Legacy position-based: convert to order
        const position = standaloneChip.position;
        if (position < 0 || (position >= 0 && position < 1)) {
          order = chipIndex;
        } else if (position >= allMoleculesForIndexing.length) {
          // Use FULL list length
          order = (allMoleculesForIndexing.length * 1000) + chipIndex + 1;
        } else {
          // Between molecules: position in range [i+1, i+2) means after molecule i
          // Use FULL list for position calculation
          for (let i = 0; i < allMoleculesForIndexing.length; i++) {
            if (position >= (i + 1) && position < (i + 2)) {
              const existingChipsAfterMolecule = standaloneCards
                .slice(0, chipIndex)
                .filter(chip => {
                  if (typeof chip.position === 'number') {
                    const chipPosition = chip.position;
                    return chipPosition >= (i + 1) && chipPosition < (i + 2);
                  }
                  return false;
                }).length;
              order = (i * 1000) + (existingChipsAfterMolecule + 1);
              break;
            }
          }
        }
      } else {
        // Default: after last molecule - use FULL list length
        order = (allMoleculesForIndexing.length * 1000) + chipIndex + 1;
      }

      // Determine afterMoleculeId and beforeMoleculeId from standaloneChip
      // FIX 1: Use FULL molecule list to find next/previous molecules (includes inactive)
      let afterMoleculeId: string | undefined = undefined;
      let beforeMoleculeId: string | undefined = undefined;
      
      if (standaloneChip.betweenMolecules && standaloneChip.betweenMolecules.length >= 2) {
        // Between two molecules: first is afterMoleculeId, second is beforeMoleculeId
        afterMoleculeId = standaloneChip.betweenMolecules[0];
        beforeMoleculeId = standaloneChip.betweenMolecules[1];
      } else if (standaloneChip.afterMoleculeId) {
        // After a specific molecule
        afterMoleculeId = standaloneChip.afterMoleculeId;
        // Find next ACTIVE molecule for beforeMoleculeId if possible
        // Use active list for finding next active molecule
        const activeMoleculeIndex = activeMoleculeIdToIndexMap.get(standaloneChip.afterMoleculeId);
        if (activeMoleculeIndex !== undefined && activeMoleculeIndex + 1 < workflowMolecules.length) {
          beforeMoleculeId = workflowMolecules[activeMoleculeIndex + 1].id;
        }
      } else if (standaloneChip.beforeMoleculeId) {
        // Before a specific molecule: find previous ACTIVE molecule for afterMoleculeId
        // Use active list for finding previous active molecule
        const activeMoleculeIndex = activeMoleculeIdToIndexMap.get(standaloneChip.beforeMoleculeId);
        if (activeMoleculeIndex !== undefined && activeMoleculeIndex > 0) {
          afterMoleculeId = workflowMolecules[activeMoleculeIndex - 1].id;
        }
        beforeMoleculeId = standaloneChip.beforeMoleculeId;
      } else if (standaloneChip.afterLastMolecule && workflowMolecules.length > 0) {
        // After last molecule
        afterMoleculeId = workflowMolecules[workflowMolecules.length - 1].id;
      } else if (standaloneChip.beforeFirstMolecule && workflowMolecules.length > 0) {
        // Before first molecule
        beforeMoleculeId = workflowMolecules[0].id;
      }

      // Create LayoutCard (no moleculeId for standalone cards)
      const card: LayoutCard = {
        id: standaloneChip.id, // Use the same ID from Workflow Mode
        atoms: [droppedAtom],
        isExhibited: false,
        // No moleculeId or moleculeTitle for standalone cards
        order: order, // Grid-based order for positioning
        afterMoleculeId: afterMoleculeId,
        beforeMoleculeId: beforeMoleculeId,
      };

      return card;
    });

    console.log('✅ Converted', standaloneCardsForLab.length, 'standalone chips to Laboratory cards format');

    // Get project context for MongoDB operations
    const projectContext = getActiveProjectContext();
    if (!projectContext) {
      toast({
        title: 'Project Context Missing',
        description: 'Unable to update Laboratory configuration. Please ensure you are in a valid project.',
        variant: 'destructive'
      });
      return;
    }

    try {
      // Fetch existing Laboratory cards from MongoDB to preserve user changes
      console.log('📡 Fetching existing Laboratory configuration from MongoDB...');
      const fetchUrl = `${LABORATORY_PROJECT_STATE_API}/get/${projectContext.client_name}/${projectContext.app_name}/${projectContext.project_name}`;
      const fetchResponse = await fetch(fetchUrl, {
        method: 'GET',
        credentials: 'include',
      });

      let existingCards: LayoutCard[] = [];
      if (fetchResponse.ok) {
        const fetchData = await fetchResponse.json();
        if (fetchData.status === 'ok' && Array.isArray(fetchData.cards)) {
          existingCards = fetchData.cards;
          console.log('✅ Found', existingCards.length, 'existing Laboratory cards');
        }
      } else {
        console.warn('⚠️ Could not fetch existing Laboratory cards, proceeding with workflow cards only');
      }

      // Merge workflow cards with existing cards
      // Strategy: 
      // 1. Start with ALL existing cards (preserves all Laboratory changes)
      // 2. For workflow molecules: Update existing cards, add missing workflow atoms
      // 3. Preserve standalone cards and molecules not in workflow
      // FIX 4: Use FULL molecule list (active + inactive) to check if cards should be preserved
      
      const workflowMoleculeIds = new Set(workflowMolecules.map(m => m.id)); // Active molecules only
      const allMoleculeIds = new Set(allMoleculesForIndexing.map(m => m.id)); // All molecules (active + inactive)
      const finalCards: LayoutCard[] = [];
      
      // Step 1: Start with ALL existing cards (preserves all Laboratory changes)
      const existingCardMap = new Map<string, LayoutCard>();
      existingCards.forEach(card => {
        if (card.moleculeId && card.atoms[0]?.atomId) {
          // Create key for molecule cards
          const key = `${card.moleculeId}:${card.atoms[0].atomId}`;
          existingCardMap.set(key, card);
        }
        // Add all existing cards to finalCards (we'll update/remove duplicates later)
        finalCards.push(card);
      });
      
      console.log('📦 Starting with', existingCards.length, 'existing Laboratory cards');

      // Step 2: Process each workflow molecule - update existing or add new
      // Also build a map of workflow atoms for filtering
      const workflowAtomMap = new Map<string, Set<string>>(); // moleculeId -> Set of atomIds
      
      workflowMolecules.forEach(molecule => {
        const atomSet = new Set<string>(molecule.atoms);
        workflowAtomMap.set(molecule.id, atomSet);
        
        molecule.atoms.forEach(atomId => {
          const key = `${molecule.id}:${atomId}`;
          const existingCard = existingCardMap.get(key);
          
          if (existingCard) {
            // Card exists - update molecule title but preserve all settings
            const cardIndex = finalCards.findIndex(c => c.id === existingCard.id);
            if (cardIndex >= 0) {
              finalCards[cardIndex] = {
                ...existingCard,
                moleculeTitle: molecule.title, // Update title if molecule was renamed
              };
              console.log(`🔄 Updated existing card: ${molecule.id}:${atomId}`);
            }
          } else {
            // Card doesn't exist - add new workflow card
            const newCard = workflowCards.find(
              card => card.moleculeId === molecule.id && card.atoms[0]?.atomId === atomId
            );
            if (newCard) {
              finalCards.push(newCard);
              console.log(`➕ Added new workflow atom: ${molecule.id}:${atomId}`);
            }
          }
        });
      });

      // Step 2.5: Add standalone chips from Workflow Mode to finalCards
      // Update existing standalone cards or add new ones
      const existingStandaloneCardMap = new Map<string, LayoutCard>();
      finalCards.filter(card => !card.moleculeId).forEach(card => {
        existingStandaloneCardMap.set(card.id, card);
      });

      standaloneCardsForLab.forEach(standaloneCard => {
        const existingCard = existingStandaloneCardMap.get(standaloneCard.id);
        if (existingCard) {
          // Update existing standalone card (preserve any Laboratory Mode changes, but update order)
          const cardIndex = finalCards.findIndex(c => c.id === standaloneCard.id);
          if (cardIndex >= 0) {
            finalCards[cardIndex] = {
              ...existingCard,
              order: standaloneCard.order, // Update order from Workflow Mode
            };
            console.log(`🔄 Updated existing standalone card: ${standaloneCard.id}`);
          }
        } else {
          // Add new standalone card from Workflow Mode
          finalCards.push(standaloneCard);
          console.log(`➕ Added new standalone card from workflow: ${standaloneCard.id}`);
        }
      });

      // Step 3: Filter out deleted atoms, molecules, and standalone cards
      // FIX 4: Preserve cards for inactive molecules (they exist in allMoleculeIds but not workflowMoleculeIds)
      // Create set of standalone card IDs from current workflow state
      const standaloneCardIds = new Set(standaloneCards.map(card => card.id));
      
      // Remove atoms that are no longer in workflow molecules
      // Remove cards for molecules that no longer exist in workflow (not even as inactive)
      // Remove standalone cards that were deleted from workflow
      const filteredCards = finalCards.filter(card => {
        // For standalone cards: only keep if they exist in current workflow state
        if (!card.moleculeId) {
          if (standaloneCardIds.has(card.id)) {
            return true; // Keep standalone card that exists in workflow
          } else {
            console.log(`🗑️ Removed deleted standalone card: ${card.id}`);
            return false; // Remove standalone card that was deleted from workflow
          }
        }

        // FIX 4: Check against ALL molecules (active + inactive) first
        // If molecule doesn't exist at all (not even as inactive), remove it
        if (!allMoleculeIds.has(card.moleculeId)) {
          console.log(`🗑️ Removed card for deleted molecule (not in all molecules): ${card.moleculeId}`);
          return false;
        }

        // FIX: Remove cards for inactive molecules - they shouldn't appear in Laboratory Mode
        // The position preservation is handled by the order field recalculation, not by keeping the cards
        if (!workflowMoleculeIds.has(card.moleculeId)) {
          console.log(`🗑️ Removed card for inactive/deleted molecule: ${card.moleculeId}`);
          return false; // Remove card for inactive molecule - it shouldn't appear in Laboratory Mode
        }

        // If molecule is active and exists in workflow, check if atom is still in workflow
        const workflowAtoms = workflowAtomMap.get(card.moleculeId);
        if (workflowAtoms) {
          const atomId = card.atoms[0]?.atomId;
          if (atomId && !workflowAtoms.has(atomId)) {
            console.log(`🗑️ Removed atom from molecule: ${card.moleculeId}:${atomId}`);
            return false;
          }
        }

        // Keep the card if it passes all filters
        return true;
      });

      // Step 4: Remove duplicates (in case any were added twice)
      const uniqueFinalCards = Array.from(
        new Map(filteredCards.map(card => [card.id, card])).values()
      );

      console.log('✅ Merged cards:', {
        total: uniqueFinalCards.length,
        workflowMolecules: uniqueFinalCards.filter(c => c.moleculeId && workflowMoleculeIds.has(c.moleculeId)).length,
        otherMolecules: uniqueFinalCards.filter(c => c.moleculeId && !workflowMoleculeIds.has(c.moleculeId)).length,
        standalone: uniqueFinalCards.filter(c => !c.moleculeId).length
      });

      // Step 5: Sort cards according to workflow molecule order to preserve inserted molecule positions
      // This ensures that when a molecule is inserted in Workflow Mode, it appears in the correct position in Laboratory Mode
      const sortCardsByWorkflowOrder = (cardsToSort: LayoutCard[], molecules: typeof workflowMolecules): LayoutCard[] => {
        if (!molecules || molecules.length === 0) {
          // No workflow molecules - sort by order field if available
          return [...cardsToSort].sort((a, b) => {
            const orderA = typeof a.order === 'number' ? a.order : Infinity;
            const orderB = typeof b.order === 'number' ? b.order : Infinity;
            return orderA - orderB;
          });
        }

        const sortedCards: LayoutCard[] = [];
        const workflowCards = cardsToSort.filter(card => card.moleculeId);
        const standaloneCards = cardsToSort.filter(card => !card.moleculeId);
        const normalizeAtomId = (atomId?: string) =>
          (atomId || '').toLowerCase().replace(/[\s_-]/g, '');

        // FIX 1: Create a map of moleculeId to moleculeIndex using FULL list (includes inactive)
        // This ensures consistent indexing with Laboratory Mode
        const moleculeIndexMap = new Map<string, number>();
        allMoleculesForIndexing.forEach((molecule, index) => {
          moleculeIndexMap.set(molecule.id, index);
        });

        // Also create active molecule index map for filtering
        const activeMoleculeIndexMap = new Map<string, number>();
        molecules.forEach((molecule, index) => {
          activeMoleculeIndexMap.set(molecule.id, index);
        });

        // Group standalone cards by their molecule references (PRIORITIZE REFERENCES)
        const chipsBeforeFirst: typeof standaloneCards = [];
        const chipsAfterMolecules: Array<{ card: LayoutCard, afterMoleculeIndex: number, subOrder: number }> = [];
        const chipsAfterLast: typeof standaloneCards = [];

        standaloneCards.forEach((card, cardIndex) => {
          // PRIORITY 1: Check betweenMolecules (most explicit)
          if (card.betweenMolecules && Array.isArray(card.betweenMolecules) && card.betweenMolecules.length === 2) {
            const [firstMoleculeId] = card.betweenMolecules;
            const firstIndex = moleculeIndexMap.get(firstMoleculeId);
            if (firstIndex !== undefined) {
              const subOrder = typeof card.order === 'number' ? (card.order % 1000) : cardIndex + 1;
              chipsAfterMolecules.push({ card, afterMoleculeIndex: firstIndex, subOrder });
              return;
            }
          }

          // PRIORITY 2: Check afterMoleculeId
          if (card.afterMoleculeId) {
            const afterIndex = moleculeIndexMap.get(card.afterMoleculeId);
            if (afterIndex !== undefined) {
              // Check if it's after the last molecule
              const isLastMolecule = afterIndex === allMoleculesForIndexing.length - 1 || 
                                     (workflowMoleculeIds.has(card.afterMoleculeId) && 
                                      activeMoleculeIndexMap.get(card.afterMoleculeId) === molecules.length - 1);
              
              if (card.afterLastMolecule || isLastMolecule) {
                chipsAfterLast.push(card);
              } else {
                const subOrder = typeof card.order === 'number' ? (card.order % 1000) : cardIndex + 1;
                chipsAfterMolecules.push({ card, afterMoleculeIndex: afterIndex, subOrder });
              }
              return;
            }
          }

          // PRIORITY 3: Check beforeMoleculeId
          if (card.beforeMoleculeId) {
            const beforeIndex = moleculeIndexMap.get(card.beforeMoleculeId);
            if (beforeIndex !== undefined) {
              const isFirstMolecule = beforeIndex === 0 || 
                                     (workflowMoleculeIds.has(card.beforeMoleculeId) && 
                                      activeMoleculeIndexMap.get(card.beforeMoleculeId) === 0);
              
              if ((card.beforeFirstMolecule || isFirstMolecule) && beforeIndex === 0) {
                chipsBeforeFirst.push(card);
              } else if (beforeIndex > 0) {
                // Before a molecule means after the previous molecule
                const subOrder = typeof card.order === 'number' ? (card.order % 1000) : cardIndex + 1;
                chipsAfterMolecules.push({ card, afterMoleculeIndex: beforeIndex - 1, subOrder });
              }
              return;
            }
          }

          // PRIORITY 4: Check beforeFirstMolecule flag
          if (card.beforeFirstMolecule) {
            chipsBeforeFirst.push(card);
            return;
          }

          // PRIORITY 5: Check afterLastMolecule flag
          if (card.afterLastMolecule) {
            chipsAfterLast.push(card);
            return;
          }

          // FALLBACK: Use order field if no references
          if (card.order !== undefined && typeof card.order === 'number') {
            const cardMoleculeIndex = Math.floor(card.order / 1000);
            if (cardMoleculeIndex < 0) {
              // Before first molecule
              chipsBeforeFirst.push(card);
            } else if (cardMoleculeIndex >= allMoleculesForIndexing.length) {
              // After last molecule
              chipsAfterLast.push(card);
            } else {
              // Between molecules
              const subOrder = card.order % 1000;
              chipsAfterMolecules.push({ card, afterMoleculeIndex: cardMoleculeIndex, subOrder });
            }
          } else {
            // No references and no order - default to after last molecule
            chipsAfterLast.push(card);
          }
        });

        // Sort chipsAfterMolecules by afterMoleculeIndex, then by subOrder
        chipsAfterMolecules.sort((a, b) => {
          if (a.afterMoleculeIndex !== b.afterMoleculeIndex) {
            return a.afterMoleculeIndex - b.afterMoleculeIndex;
          }
          return a.subOrder - b.subOrder;
        });

        // Sort chipsBeforeFirst and chipsAfterLast by order field
        chipsBeforeFirst.sort((a, b) => {
          const orderA = typeof a.order === 'number' ? (a.order % 1000) : 0;
          const orderB = typeof b.order === 'number' ? (b.order % 1000) : 0;
          return orderA - orderB;
        });

        chipsAfterLast.sort((a, b) => {
          const orderA = typeof a.order === 'number' ? a.order : Infinity;
          const orderB = typeof b.order === 'number' ? b.order : Infinity;
          return orderA - orderB;
        });

        // FIX 1: Process molecules in FULL list order (includes inactive) to preserve positions
        // This ensures standalone cards are placed correctly relative to inactive molecules
        allMoleculesForIndexing.forEach((molecule, fullMoleculeIndex) => {
          // Only add cards for active molecules (molecules that are in the workflow)
          const isActiveMolecule = workflowMoleculeIds.has(molecule.id);
          
          if (isActiveMolecule) {
            const workflowOrder = (molecule.atomOrder && molecule.atomOrder.length > 0)
              ? molecule.atomOrder
              : molecule.atoms;

            const moleculeCards = workflowCards
              .filter(card => card.moleculeId === molecule.id)
              .sort((a, b) => {
                const atomA = normalizeAtomId(a.atoms[0]?.atomId);
                const atomB = normalizeAtomId(b.atoms[0]?.atomId);
                const orderA = workflowOrder.findIndex(atom => normalizeAtomId(atom) === atomA);
                const orderB = workflowOrder.findIndex(atom => normalizeAtomId(atom) === atomB);
                return (orderA === -1 ? Number.MAX_SAFE_INTEGER : orderA) -
                       (orderB === -1 ? Number.MAX_SAFE_INTEGER : orderB);
              })
              .map((card, cardIndex) => ({
                ...card,
                order: (fullMoleculeIndex * 1000) + cardIndex
              }));

            sortedCards.push(...moleculeCards);
          }

          // Add standalone cards that should appear after this molecule (based on references)
          const cardsAfterThisMolecule = chipsAfterMolecules
            .filter(item => item.afterMoleculeIndex === fullMoleculeIndex)
            .map(item => item.card);

          // Update order field for these cards based on their position
          cardsAfterThisMolecule.forEach((card, index) => {
            const subOrder = typeof card.order === 'number' ? (card.order % 1000) : (index + 1);
            // Update order field based on current molecule index
            card.order = (fullMoleculeIndex * 1000) + subOrder;
          });

          sortedCards.push(...cardsAfterThisMolecule);
        });

        // Add chips before first molecule (update their order to 0 or negative)
        chipsBeforeFirst.forEach((card, index) => {
          const subOrder = typeof card.order === 'number' ? (card.order % 1000) : index;
          card.order = subOrder; // Before first molecule: order = subOrder (0-999)
        });
        sortedCards.unshift(...chipsBeforeFirst); // Add at the beginning

        // Add chips after last molecule (update their order)
        const lastMoleculeIndex = allMoleculesForIndexing.length > 0 ? allMoleculesForIndexing.length - 1 : 0;
        chipsAfterLast.forEach((card, index) => {
          const subOrder = typeof card.order === 'number' ? (card.order % 1000) : (index + 1);
          // Update order field: after last molecule uses last index + 1
          card.order = ((lastMoleculeIndex + 1) * 1000) + subOrder;
        });
        sortedCards.push(...chipsAfterLast);

        // Add any remaining workflow cards that weren't in any molecule (shouldn't happen, but safety check)
        // FIX: Filter out cards for inactive molecules - they shouldn't be added
        const allProcessedIds = new Set(sortedCards.map(c => c.id));
        const remaining = cardsToSort.filter(c => {
          if (!allProcessedIds.has(c.id)) {
            // Only include if it's a standalone card OR if it's an active molecule card
            if (!c.moleculeId) {
              return true; // Standalone cards
            }
            // For molecule cards, only include if molecule is active
            return workflowMoleculeIds.has(c.moleculeId);
          }
          return false;
        });
        sortedCards.push(...remaining);

        return sortedCards;
      };

      // Sort cards according to workflow molecule order (includes newly inserted molecules in correct position)
      const sortedFinalCards = sortCardsByWorkflowOrder(uniqueFinalCards, workflowMolecules);

      console.log('📋 Sorted cards according to workflow molecule order:', {
        originalCount: uniqueFinalCards.length,
        sortedCount: sortedFinalCards.length,
        workflowMoleculesOrder: workflowMolecules.map((m, i) => ({ index: i, id: m.id, title: m.title })),
        sortedCardsOrder: sortedFinalCards
          .filter(c => c.moleculeId && workflowMoleculeIds.has(c.moleculeId))
          .map((c, i) => ({ 
            index: i, 
            moleculeId: c.moleculeId, 
            atomId: c.atoms[0]?.atomId 
          }))
      });

      // FIX: ALWAYS calculate fresh order and references based on card's position in sorted list
      // This ensures consistency with Lab → Workflow sync which always recalculates order
      // Handle case where previous molecule is inactive (removed) - card should appear before next active molecule
      const updatedStandaloneCards = sortedFinalCards.map((card, cardIndex) => {
        if (!card.moleculeId) {
          // This is a standalone card - calculate fresh order and references based on its position
          let afterMoleculeId: string | undefined = undefined;
          let beforeMoleculeId: string | undefined = undefined;
          let recalculatedOrder: number | undefined = undefined;
          const subOrder = typeof card.order === 'number' ? (card.order % 1000) : 1;

          // First, check the original order to understand which molecule position this card was after
          // This helps handle cases where the previous molecule was removed (inactive)
          const originalOrder = typeof card.order === 'number' ? card.order : -1;
          const originalMoleculeIndex = originalOrder >= 0 ? Math.floor(originalOrder / 1000) : -1;
          const originalMolecule = originalMoleculeIndex >= 0 && originalMoleculeIndex < allMoleculesForIndexing.length
            ? allMoleculesForIndexing[originalMoleculeIndex]
            : undefined;
          const originalMoleculeIsActive = originalMolecule ? workflowMoleculeIds.has(originalMolecule.id) : false;

          // Find the next ACTIVE molecule in sortedFinalCards (this is what we'll see in Lab Mode)
          let nextActiveMoleculeInSorted: typeof allMoleculesForIndexing[0] | undefined = undefined;
          let nextActiveMoleculeIndex = -1;
          for (let i = cardIndex + 1; i < sortedFinalCards.length; i++) {
            const nextCard = sortedFinalCards[i];
            if (nextCard.moleculeId && workflowMoleculeIds.has(nextCard.moleculeId)) {
              // Found an active molecule card - find its index in the FULL list
              nextActiveMoleculeIndex = allMoleculesForIndexing.findIndex(m => m.id === nextCard.moleculeId);
              if (nextActiveMoleculeIndex >= 0) {
                nextActiveMoleculeInSorted = allMoleculesForIndexing[nextActiveMoleculeIndex];
                break;
              }
            }
          }

          // Find the previous ACTIVE molecule in sortedFinalCards
          let previousActiveMoleculeInSorted: typeof allMoleculesForIndexing[0] | undefined = undefined;
          let previousActiveMoleculeIndex = -1;
          for (let i = cardIndex - 1; i >= 0; i--) {
            const prevCard = sortedFinalCards[i];
            if (prevCard.moleculeId && workflowMoleculeIds.has(prevCard.moleculeId)) {
              // Found an active molecule card - find its index in the FULL list
              previousActiveMoleculeIndex = allMoleculesForIndexing.findIndex(m => m.id === prevCard.moleculeId);
              if (previousActiveMoleculeIndex >= 0) {
                previousActiveMoleculeInSorted = allMoleculesForIndexing[previousActiveMoleculeIndex];
                break;
              }
            }
          }

          // Calculate fresh references based on position and original order
          if (previousActiveMoleculeInSorted && nextActiveMoleculeInSorted) {
            // Card is between two ACTIVE molecules
            afterMoleculeId = previousActiveMoleculeInSorted.id;
            beforeMoleculeId = nextActiveMoleculeInSorted.id;
            recalculatedOrder = (previousActiveMoleculeIndex * 1000) + subOrder;
          } else if (previousActiveMoleculeInSorted) {
            // Card is after the last ACTIVE molecule
            afterMoleculeId = previousActiveMoleculeInSorted.id;
            recalculatedOrder = (previousActiveMoleculeIndex * 1000) + subOrder;
            // No beforeMoleculeId - it's after the last molecule
          } else if (nextActiveMoleculeInSorted) {
            // Card is before the first ACTIVE molecule (previous molecule was removed/inactive)
            // This is the case: m0 (removed), a1, m1 -> a1 should appear before m1
            beforeMoleculeId = nextActiveMoleculeInSorted.id;
            
            // If original molecule was inactive (removed), place before first active molecule
            if (!originalMoleculeIsActive && originalMoleculeIndex >= 0) {
              // Find the previous active molecule before the original molecule's position
              let foundPreviousActive = false;
              for (let i = originalMoleculeIndex - 1; i >= 0; i--) {
                const prevActiveMolecule = allMoleculesForIndexing[i];
                if (prevActiveMolecule && workflowMoleculeIds.has(prevActiveMolecule.id)) {
                  afterMoleculeId = prevActiveMolecule.id;
                  recalculatedOrder = (i * 1000) + subOrder;
                  foundPreviousActive = true;
                  break;
                }
              }
              
              // If no previous active molecule found (original was at index 0), place before first
              if (!foundPreviousActive) {
                recalculatedOrder = 0; // Before first active molecule
                // No afterMoleculeId - it's before the first active molecule
              }
            } else {
              // Original molecule position is valid, use it
              recalculatedOrder = (nextActiveMoleculeIndex * 1000) - 1; // Just before next molecule
            }
          } else {
            // No active molecules found (shouldn't happen, but handle gracefully)
            // Default to after last molecule if any molecules exist
            if (workflowMolecules.length > 0) {
              const lastMolecule = workflowMolecules[workflowMolecules.length - 1];
              afterMoleculeId = lastMolecule.id;
              const lastFullIndex = allMoleculesForIndexing.findIndex(m => m.id === lastMolecule.id);
              if (lastFullIndex >= 0) {
                recalculatedOrder = (lastFullIndex * 1000) + subOrder;
              }
            }
          }

          // Preserve betweenMolecules if both after and before are set
          const finalBetweenMolecules = (afterMoleculeId && beforeMoleculeId) 
            ? [afterMoleculeId, beforeMoleculeId] as [string, string]
            : undefined;

          return {
            ...card, // Preserve all card properties (atoms, configuration, etc.)
            afterMoleculeId,
            beforeMoleculeId,
            betweenMolecules: finalBetweenMolecules,
            order: recalculatedOrder !== undefined ? recalculatedOrder : (card.order || 0) // Always use recalculated order
          };
        }
        return card;
      });

      // FIX: Ensure updatedStandaloneCards is an array (contains ALL cards, not just standalone)
      if (!Array.isArray(updatedStandaloneCards)) {
        console.error('❌ updatedStandaloneCards is not an array after map:', updatedStandaloneCards);
        toast({
          title: 'Save Error',
          description: 'Failed to process cards. Cannot save to Laboratory configuration.',
          variant: 'destructive'
        });
        return;
      }

      console.log('🔄 Updated standalone card molecule references:', {
        totalCards: updatedStandaloneCards.length,
        standaloneCount: updatedStandaloneCards.filter(c => !c.moleculeId).length,
        moleculeCardsCount: updatedStandaloneCards.filter(c => c.moleculeId).length,
        updates: updatedStandaloneCards
          .filter(c => !c.moleculeId)
          .map(c => ({
            id: c.id,
            afterMoleculeId: c.afterMoleculeId,
            beforeMoleculeId: c.beforeMoleculeId,
            order: c.order
          }))
      });

      // Save merged cards to MongoDB atom_list_configuration
      console.log('💾 Saving merged Laboratory configuration to MongoDB...');
      
      // FIX: Ensure cards is always an array
      const cardsToSave = Array.isArray(updatedStandaloneCards) ? updatedStandaloneCards : [];
      
      if (!Array.isArray(updatedStandaloneCards)) {
        console.error('❌ updatedStandaloneCards is not an array:', updatedStandaloneCards);
        toast({
          title: 'Save Error',
          description: 'Cards data is invalid. Cannot save to Laboratory configuration.',
          variant: 'destructive'
        });
        return;
      }
      
      const saveUrl = `${LABORATORY_PROJECT_STATE_API}/save`;
      const savePayload = {
        client_name: projectContext.client_name,
        app_name: projectContext.app_name,
        project_name: projectContext.project_name,
        cards: cardsToSave, // Use updated cards with refreshed molecule references
        mode: 'laboratory',
      };

      const saveResponse = await fetch(saveUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(savePayload),
      });

      if (!saveResponse.ok) {
        const message = await saveResponse.text();
        console.error('❌ Failed to save merged Laboratory configuration:', message);
        toast({
          title: 'Save Error',
          description: 'Failed to save Laboratory configuration. Please try again.',
          variant: 'destructive'
        });
        return;
      }

      console.log('✅ Merged Laboratory configuration saved successfully');
      
      // Save workflow molecules to localStorage in format expected by Laboratory Mode
      // This ensures Laboratory Mode can sort cards correctly based on workflow molecule order
      // Format: [{ moleculeId, moleculeTitle, atoms: [{ atomName, order }] }]
      const workflowMoleculesForLab = workflowMolecules.map(mol => {
        const orderSource = mol.atomOrder && mol.atomOrder.length > 0 ? mol.atomOrder : mol.atoms;
        return {
          moleculeId: mol.id,
          moleculeTitle: mol.title,
          atoms: orderSource.map((atomId, index) => ({
            atomName: atomId,
            order: index
          }))
        };
      });
      localStorage.setItem('workflow-molecules', JSON.stringify(workflowMoleculesForLab));
      console.log('💾 Saved workflow molecules to localStorage for Laboratory Mode sorting:', workflowMoleculesForLab);
    
    toast({
      title: 'Workflow Rendered',
      description: 'Workflow has been prepared for Laboratory mode'
    });

    // Navigate to Laboratory mode
    navigate('/laboratory');
    } catch (error) {
      console.error('❌ Error merging workflow with Laboratory configuration:', error);
      toast({
        title: 'Render Error',
        description: 'Failed to merge workflow with Laboratory configuration. Please try again.',
        variant: 'destructive'
      });
    }
  }, [canvasMolecules, customMolecules, standaloneCards, workflowName, toast, navigate]);

  // Helper function to sync Workflow Mode to Laboratory Mode
  // This performs the same sync logic as handleRenderWorkflow but without navigation
  const syncWorkflowToLaboratory = useCallback(async (): Promise<boolean> => {
    try {
      // Check if all molecules have at least one atom (only active molecules)
      const moleculesWithAtoms = canvasMolecules.filter(mol => mol.isActive !== false && mol.atoms && mol.atoms.length > 0);
      
      if (moleculesWithAtoms.length === 0) {
        console.warn('⚠️ No molecules with atoms - skipping Laboratory sync');
        return false; // Skip sync if no molecules with atoms
      }

      // Function to convert atom names to atom IDs for Laboratory mode
      const convertAtomNameToId = (atomName: string) => {
        return atomName
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '');
      };

      // Use FULL molecule list (active + inactive) for consistent indexing
      const allMoleculesForIndexing = canvasMolecules; // Includes both active and inactive
      const activeMoleculesForRendering = moleculesWithAtoms; // Only active molecules for rendering
      
      // Create a map of ALL molecule IDs to their indices in the FULL list
      const fullMoleculeIdToIndexMap = new Map<string, number>();
      allMoleculesForIndexing.forEach((mol, index) => {
        fullMoleculeIdToIndexMap.set(mol.id, index);
      });
      
      // Create a map of active molecule IDs to their indices in the active list
      const activeMoleculeIdToIndexMap = new Map<string, number>();
      activeMoleculesForRendering.forEach((mol, index) => {
        activeMoleculeIdToIndexMap.set(mol.id, index);
      });

      // Prepare workflow molecules
      const workflowMolecules = activeMoleculesForRendering.map(mol => ({
        id: mol.id,
        title: mol.title,
        atoms: mol.atoms.map(atomName => convertAtomNameToId(atomName)),
        atomOrder: (mol.atomOrder || mol.atoms).map(atomName => convertAtomNameToId(atomName))
      }));

      // Convert workflow molecules to Laboratory cards format
      const workflowCards = convertWorkflowMoleculesToLaboratoryCards(workflowMolecules);

      // Convert standalone chips to Laboratory Mode cards format
      const LLM_MAP: Record<string, string> = {
        concat: 'Agent Concat',
        'chart-maker': 'Agent Chart Maker',
        merge: 'Agent Merge',
        'create-column': 'Agent Create Transform',
        'groupby-wtg-avg': 'Agent GroupBy',
        'explore': 'Agent Explore',
        'dataframe-operations': 'Agent DataFrame Operations',
      };

      const normalize = (s: string) => s.toLowerCase().replace(/[\s_-]/g, '');
      const workflowMoleculeIds = new Set(workflowMolecules.map(m => m.id));
      const allMoleculeIds = new Set(allMoleculesForIndexing.map(m => m.id));

      // [Rest of the sync logic from handleRenderWorkflow - lines 944-1616]
      // This includes: converting standalone cards, merging with existing cards, recalculating order, saving to MongoDB
      // For brevity, I'll reference the existing logic in handleRenderWorkflow
      
      // Get project context
      const projectContext = getActiveProjectContext();
      if (!projectContext) {
        console.warn('⚠️ Project context missing - skipping Laboratory sync');
        return false;
      }

      // Fetch existing Laboratory cards
      const fetchUrl = `${LABORATORY_PROJECT_STATE_API}/get/${projectContext.client_name}/${projectContext.app_name}/${projectContext.project_name}`;
      const fetchResponse = await fetch(fetchUrl, {
        method: 'GET',
        credentials: 'include',
      });

      let existingCards: LayoutCard[] = [];
      if (fetchResponse.ok) {
        const fetchData = await fetchResponse.json();
        if (fetchData.status === 'ok' && Array.isArray(fetchData.cards)) {
          existingCards = fetchData.cards;
        }
      }

      // Convert standalone chips to Laboratory cards
      const standaloneCardsForLab: LayoutCard[] = standaloneCards.map((standaloneChip, chipIndex) => {
        const atomInfo = allAtoms.find(
          a =>
            normalize(a.id) === normalize(standaloneChip.atomId) ||
            normalize(a.title) === normalize(standaloneChip.atomId) ||
            normalize(a.title) === normalize(standaloneChip.title),
        ) || ({} as any);

        const resolvedAtomId = atomInfo.id || standaloneChip.atomId;
        const droppedAtom: DroppedAtom = {
          id: `${resolvedAtomId}-${Date.now()}-${Math.random()}-${chipIndex}`,
          atomId: resolvedAtomId,
          title: atomInfo.title || standaloneChip.title || standaloneChip.atomId,
          category: atomInfo.category || 'Atom',
          color: atomInfo.color || 'bg-gray-400',
          source: 'manual',
          llm: LLM_MAP[resolvedAtomId],
        };

        // Calculate order and references (same logic as handleRenderWorkflow)
        let order: number | undefined;
        let afterMoleculeId: string | undefined = undefined;
        let beforeMoleculeId: string | undefined = undefined;

        if (standaloneChip.betweenMolecules && Array.isArray(standaloneChip.betweenMolecules) && standaloneChip.betweenMolecules.length === 2) {
          const [firstMoleculeId] = standaloneChip.betweenMolecules;
          const moleculeIndex = fullMoleculeIdToIndexMap.get(firstMoleculeId);
          if (moleculeIndex !== undefined) {
            const existingChipsAfterMolecule = standaloneCards
              .slice(0, chipIndex)
              .filter(chip => {
                if (chip.betweenMolecules && Array.isArray(chip.betweenMolecules) && chip.betweenMolecules[0] === firstMoleculeId) {
                  return true;
                }
                return chip.afterMoleculeId === firstMoleculeId;
              }).length;
            order = (moleculeIndex * 1000) + (existingChipsAfterMolecule + 1);
            afterMoleculeId = firstMoleculeId;
            beforeMoleculeId = standaloneChip.betweenMolecules[1];
          }
        } else if (standaloneChip.afterMoleculeId) {
          const moleculeIndex = fullMoleculeIdToIndexMap.get(standaloneChip.afterMoleculeId);
          if (moleculeIndex !== undefined) {
            if (standaloneChip.afterLastMolecule) {
              order = (allMoleculesForIndexing.length * 1000) + chipIndex + 1;
            } else {
              const existingChipsAfterMolecule = standaloneCards
                .slice(0, chipIndex)
                .filter(chip => chip.afterMoleculeId === standaloneChip.afterMoleculeId && !chip.afterLastMolecule).length;
              order = (moleculeIndex * 1000) + (existingChipsAfterMolecule + 1);
            }
            afterMoleculeId = standaloneChip.afterMoleculeId;
            const activeMoleculeIndex = activeMoleculeIdToIndexMap.get(standaloneChip.afterMoleculeId);
            if (activeMoleculeIndex !== undefined && activeMoleculeIndex + 1 < workflowMolecules.length) {
              beforeMoleculeId = workflowMolecules[activeMoleculeIndex + 1].id;
            }
          }
        } else if (standaloneChip.beforeMoleculeId) {
          const moleculeIndex = fullMoleculeIdToIndexMap.get(standaloneChip.beforeMoleculeId);
          if (moleculeIndex !== undefined && moleculeIndex > 0) {
            const previousMoleculeIndex = moleculeIndex - 1;
            const existingChipsAfterPrevious = standaloneCards
              .slice(0, chipIndex)
              .filter(chip => {
                if (chip.afterMoleculeId) {
                  const chipMoleculeIndex = fullMoleculeIdToIndexMap.get(chip.afterMoleculeId);
                  return chipMoleculeIndex === previousMoleculeIndex;
                }
                return false;
              }).length;
            order = (previousMoleculeIndex * 1000) + (existingChipsAfterPrevious + 1);
            const activeMoleculeIndex = activeMoleculeIdToIndexMap.get(standaloneChip.beforeMoleculeId);
            if (activeMoleculeIndex !== undefined && activeMoleculeIndex > 0) {
              afterMoleculeId = workflowMolecules[activeMoleculeIndex - 1].id;
            }
            beforeMoleculeId = standaloneChip.beforeMoleculeId;
          } else if (moleculeIndex === 0 && standaloneChip.beforeFirstMolecule) {
            order = chipIndex;
            beforeMoleculeId = standaloneChip.beforeMoleculeId;
          }
        } else if (standaloneChip.beforeFirstMolecule) {
          order = chipIndex;
          if (workflowMolecules.length > 0) {
            beforeMoleculeId = workflowMolecules[0].id;
          }
        } else if (standaloneChip.afterLastMolecule) {
          order = (allMoleculesForIndexing.length * 1000) + chipIndex + 1;
          if (workflowMolecules.length > 0) {
            afterMoleculeId = workflowMolecules[workflowMolecules.length - 1].id;
          }
        } else {
          order = (allMoleculesForIndexing.length * 1000) + chipIndex + 1;
        }

        return {
          id: standaloneChip.id,
          atoms: [droppedAtom],
          isExhibited: false,
          order: order,
          afterMoleculeId: afterMoleculeId,
          beforeMoleculeId: beforeMoleculeId,
        } as LayoutCard;
      });

      // Merge workflow cards with existing cards (same logic as handleRenderWorkflow)
      const finalCards: LayoutCard[] = [];
      const existingCardMap = new Map<string, LayoutCard>();
      existingCards.forEach(card => {
        if (card.moleculeId && card.atoms[0]?.atomId) {
          const key = `${card.moleculeId}:${card.atoms[0].atomId}`;
          existingCardMap.set(key, card);
        }
        finalCards.push(card);
      });

      const workflowAtomMap = new Map<string, Set<string>>();
      workflowMolecules.forEach(molecule => {
        const atomSet = new Set<string>(molecule.atoms);
        workflowAtomMap.set(molecule.id, atomSet);
        
        molecule.atoms.forEach(atomId => {
          const key = `${molecule.id}:${atomId}`;
          const existingCard = existingCardMap.get(key);
          
          if (existingCard) {
            const cardIndex = finalCards.findIndex(c => c.id === existingCard.id);
            if (cardIndex >= 0) {
              finalCards[cardIndex] = {
                ...existingCard,
                moleculeTitle: molecule.title,
              };
            }
          } else {
            const newCard = workflowCards.find(
              card => card.moleculeId === molecule.id && card.atoms[0]?.atomId === atomId
            );
            if (newCard) {
              finalCards.push(newCard);
            }
          }
        });
      });

      // Add standalone cards
      const existingStandaloneCardMap = new Map<string, LayoutCard>();
      finalCards.filter(card => !card.moleculeId).forEach(card => {
        existingStandaloneCardMap.set(card.id, card);
      });

      standaloneCardsForLab.forEach(standaloneCard => {
        const existingCard = existingStandaloneCardMap.get(standaloneCard.id);
        if (existingCard) {
          const cardIndex = finalCards.findIndex(c => c.id === standaloneCard.id);
          if (cardIndex >= 0) {
            finalCards[cardIndex] = {
              ...existingCard,
              order: standaloneCard.order,
            };
          }
        } else {
          finalCards.push(standaloneCard);
        }
      });

      // Filter out deleted atoms/molecules
      const standaloneCardIds = new Set(standaloneCards.map(card => card.id));
      const filteredCards = finalCards.filter(card => {
        if (!card.moleculeId) {
          return standaloneCardIds.has(card.id);
        }
        if (!allMoleculeIds.has(card.moleculeId)) {
          return false;
        }
        if (!workflowMoleculeIds.has(card.moleculeId)) {
          return false;
        }
        const workflowAtoms = workflowAtomMap.get(card.moleculeId);
        if (workflowAtoms) {
          const atomId = card.atoms[0]?.atomId;
          if (atomId && !workflowAtoms.has(atomId)) {
            return false;
          }
        }
        return true;
      });

      const uniqueFinalCards = Array.from(
        new Map(filteredCards.map(card => [card.id, card])).values()
      );

      // Sort cards (same logic as handleRenderWorkflow)
      const sortCardsByWorkflowOrder = (cardsToSort: LayoutCard[], molecules: typeof workflowMolecules): LayoutCard[] => {
        if (!molecules || molecules.length === 0) {
          return [...cardsToSort].sort((a, b) => {
            const orderA = typeof a.order === 'number' ? a.order : Infinity;
            const orderB = typeof b.order === 'number' ? b.order : Infinity;
            return orderA - orderB;
          });
        }

        const sortedCards: LayoutCard[] = [];
        const workflowCards = cardsToSort.filter(card => card.moleculeId);
        const standaloneCards = cardsToSort.filter(card => !card.moleculeId);
        const normalizeAtomId = (atomId?: string) =>
          (atomId || '').toLowerCase().replace(/[\s_-]/g, '');

        const moleculeIndexMap = new Map<string, number>();
        allMoleculesForIndexing.forEach((molecule, index) => {
          moleculeIndexMap.set(molecule.id, index);
        });

        allMoleculesForIndexing.forEach((molecule, fullMoleculeIndex) => {
          const isActiveMolecule = workflowMoleculeIds.has(molecule.id);
          
          if (isActiveMolecule) {
            const workflowOrder = (molecule.atomOrder && molecule.atomOrder.length > 0)
              ? molecule.atomOrder
              : molecule.atoms;

            const moleculeCards = workflowCards
              .filter(card => card.moleculeId === molecule.id)
              .sort((a, b) => {
                const atomA = normalizeAtomId(a.atoms[0]?.atomId);
                const atomB = normalizeAtomId(b.atoms[0]?.atomId);
                const orderA = workflowOrder.findIndex(atom => normalizeAtomId(atom) === atomA);
                const orderB = workflowOrder.findIndex(atom => normalizeAtomId(atom) === atomB);
                return (orderA === -1 ? Number.MAX_SAFE_INTEGER : orderA) -
                       (orderB === -1 ? Number.MAX_SAFE_INTEGER : orderB);
              })
              .map((card, cardIndex) => ({
                ...card,
                order: (fullMoleculeIndex * 1000) + cardIndex
              }));

            sortedCards.push(...moleculeCards);
          }

          const cardsAfterThisMolecule = standaloneCards.filter(card => {
            if (card.order !== undefined && typeof card.order === 'number') {
              const cardMoleculeIndex = Math.floor(card.order / 1000);
              return cardMoleculeIndex === fullMoleculeIndex;
            }
            return false;
          });

          cardsAfterThisMolecule.sort((a, b) => {
            const subOrderA = a.order !== undefined ? a.order % 1000 : 0;
            const subOrderB = b.order !== undefined ? b.order % 1000 : 0;
            return subOrderA - subOrderB;
          });

          cardsAfterThisMolecule.forEach((card, index) => {
            const subOrder = typeof card.order === 'number' ? (card.order % 1000) : (index + 1);
            card.order = (fullMoleculeIndex * 1000) + subOrder;
          });
          sortedCards.push(...cardsAfterThisMolecule);
        });

        const placedStandaloneIds = new Set(sortedCards.map(c => c.id));
        const orphanCards = standaloneCards.filter(card => !placedStandaloneIds.has(card.id));
        sortedCards.push(...orphanCards);

        const allProcessedIds = new Set(sortedCards.map(c => c.id));
        const remaining = cardsToSort.filter(c => {
          if (!allProcessedIds.has(c.id)) {
            if (!c.moleculeId) {
              return true;
            }
            return workflowMoleculeIds.has(c.moleculeId);
          }
          return false;
        });
        sortedCards.push(...remaining);

        return sortedCards;
      };

      const sortedFinalCards = sortCardsByWorkflowOrder(uniqueFinalCards, workflowMolecules);

      // Recalculate order and references (same logic as handleRenderWorkflow)
      const updatedStandaloneCards = sortedFinalCards.map((card, cardIndex) => {
        if (!card.moleculeId) {
          let afterMoleculeId: string | undefined = undefined;
          let beforeMoleculeId: string | undefined = undefined;
          let recalculatedOrder: number | undefined = undefined;
          const subOrder = typeof card.order === 'number' ? (card.order % 1000) : 1;

          const originalOrder = typeof card.order === 'number' ? card.order : -1;
          const originalMoleculeIndex = originalOrder >= 0 ? Math.floor(originalOrder / 1000) : -1;
          const originalMolecule = originalMoleculeIndex >= 0 && originalMoleculeIndex < allMoleculesForIndexing.length
            ? allMoleculesForIndexing[originalMoleculeIndex]
            : undefined;
          const originalMoleculeIsActive = originalMolecule ? workflowMoleculeIds.has(originalMolecule.id) : false;

          let nextActiveMoleculeInSorted: typeof allMoleculesForIndexing[0] | undefined = undefined;
          let nextActiveMoleculeIndex = -1;
          for (let i = cardIndex + 1; i < sortedFinalCards.length; i++) {
            const nextCard = sortedFinalCards[i];
            if (nextCard.moleculeId && workflowMoleculeIds.has(nextCard.moleculeId)) {
              nextActiveMoleculeIndex = allMoleculesForIndexing.findIndex(m => m.id === nextCard.moleculeId);
              if (nextActiveMoleculeIndex >= 0) {
                nextActiveMoleculeInSorted = allMoleculesForIndexing[nextActiveMoleculeIndex];
                break;
              }
            }
          }

          let previousActiveMoleculeInSorted: typeof allMoleculesForIndexing[0] | undefined = undefined;
          let previousActiveMoleculeIndex = -1;
          for (let i = cardIndex - 1; i >= 0; i--) {
            const prevCard = sortedFinalCards[i];
            if (prevCard.moleculeId && workflowMoleculeIds.has(prevCard.moleculeId)) {
              previousActiveMoleculeIndex = allMoleculesForIndexing.findIndex(m => m.id === prevCard.moleculeId);
              if (previousActiveMoleculeIndex >= 0) {
                previousActiveMoleculeInSorted = allMoleculesForIndexing[previousActiveMoleculeIndex];
                break;
              }
            }
          }

          if (previousActiveMoleculeInSorted && nextActiveMoleculeInSorted) {
            afterMoleculeId = previousActiveMoleculeInSorted.id;
            beforeMoleculeId = nextActiveMoleculeInSorted.id;
            recalculatedOrder = (previousActiveMoleculeIndex * 1000) + subOrder;
          } else if (previousActiveMoleculeInSorted) {
            afterMoleculeId = previousActiveMoleculeInSorted.id;
            recalculatedOrder = (previousActiveMoleculeIndex * 1000) + subOrder;
          } else if (nextActiveMoleculeInSorted) {
            beforeMoleculeId = nextActiveMoleculeInSorted.id;
            
            if (!originalMoleculeIsActive && originalMoleculeIndex >= 0) {
              let foundPreviousActive = false;
              for (let i = originalMoleculeIndex - 1; i >= 0; i--) {
                const prevActiveMolecule = allMoleculesForIndexing[i];
                if (prevActiveMolecule && workflowMoleculeIds.has(prevActiveMolecule.id)) {
                  afterMoleculeId = prevActiveMolecule.id;
                  recalculatedOrder = (i * 1000) + subOrder;
                  foundPreviousActive = true;
                  break;
                }
              }
              
              if (!foundPreviousActive) {
                recalculatedOrder = 0;
              }
            } else {
              recalculatedOrder = (nextActiveMoleculeIndex * 1000) - 1;
            }
          } else {
            if (workflowMolecules.length > 0) {
              const lastMolecule = workflowMolecules[workflowMolecules.length - 1];
              afterMoleculeId = lastMolecule.id;
              const lastFullIndex = allMoleculesForIndexing.findIndex(m => m.id === lastMolecule.id);
              if (lastFullIndex >= 0) {
                recalculatedOrder = (lastFullIndex * 1000) + subOrder;
              }
            }
          }

          const finalBetweenMolecules = (afterMoleculeId && beforeMoleculeId) 
            ? [afterMoleculeId, beforeMoleculeId] as [string, string]
            : undefined;

          return {
            ...card,
            afterMoleculeId,
            beforeMoleculeId,
            betweenMolecules: finalBetweenMolecules,
            order: recalculatedOrder !== undefined ? recalculatedOrder : (card.order || 0)
          };
        }
        return card;
      });

      if (!Array.isArray(updatedStandaloneCards)) {
        console.error('❌ updatedStandaloneCards is not an array');
        return false;
      }

      // Save to MongoDB
      const saveUrl = `${LABORATORY_PROJECT_STATE_API}/save`;
      const savePayload = {
        client_name: projectContext.client_name,
        app_name: projectContext.app_name,
        project_name: projectContext.project_name,
        cards: updatedStandaloneCards,
        mode: 'laboratory',
      };

      const saveResponse = await fetch(saveUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(savePayload),
      });

      if (!saveResponse.ok) {
        const message = await saveResponse.text();
        console.error('❌ Failed to save Laboratory configuration:', message);
        return false;
      }

      // Save workflow molecules to localStorage
      const workflowMoleculesForLab = workflowMolecules.map(mol => {
        const orderSource = mol.atomOrder && mol.atomOrder.length > 0 ? mol.atomOrder : mol.atoms;
        return {
          moleculeId: mol.id,
          moleculeTitle: mol.title,
          atoms: orderSource.map((atomId, index) => ({
            atomName: atomId,
            order: index
          }))
        };
      });
      localStorage.setItem('workflow-molecules', JSON.stringify(workflowMoleculesForLab));

      console.log('✅ Laboratory configuration synced successfully');
      return true;
    } catch (error) {
      console.error('❌ Error syncing to Laboratory:', error);
      return false;
    }
  }, [canvasMolecules, standaloneCards]);

  // Function to save workflow configuration
  const saveWorkflowConfiguration = async () => {
    try {
      // Get environment variables for MongoDB saving
      const envStr = localStorage.getItem('env');
      const env = envStr ? JSON.parse(envStr) : {};
      const client_name = env.CLIENT_NAME || 'default_client';
      const app_name = env.APP_NAME || 'default_app';
      const project_name = env.PROJECT_NAME || 'default_project';
      
      console.log('🔍 Saving workflow with:', { client_name, app_name, project_name });

      // canvasMolecules and customMolecules already contain all molecules (active + inactive)
      // No need to merge - state already preserves inactive molecules

      const response = await fetch(`${MOLECULES_API}/workflow/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          workflow_name: workflowName,
            canvas_molecules: canvasMolecules, // Save all molecules (active + inactive) - state already contains all
            custom_molecules: customMolecules, // Save all molecules (active + inactive) - state already contains all
            standalone_cards: standaloneCards,
          user_id: '', // Could be enhanced with actual user ID from session
          client_name: client_name,
          app_name: app_name,
          project_name: project_name
        })
      });

      if (response.ok) {
        const result = await response.json();
        
        // FIX: Also sync to Laboratory Mode when saving
        console.log('🔄 Syncing to Laboratory Mode...');
        const syncSuccess = await syncWorkflowToLaboratory();
        
        toast({
          title: "Workflow Saved",
          description: syncSuccess 
            ? "Workflow configuration has been saved and synced to Laboratory mode successfully" 
            : "Workflow configuration saved, but Laboratory sync had issues",
        });
        console.log('Workflow saved:', result);
      } else {
        throw new Error('Failed to save workflow');
      }
    } catch (error) {
      console.error('Error saving workflow:', error);
      toast({
        title: "Save Failed",
        description: "Failed to save workflow configuration. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Function to load workflow configuration
  const loadWorkflowConfiguration = async (showToast: boolean = true): Promise<boolean> => {
    try {
      // Get environment variables for MongoDB saving
      const envStr = localStorage.getItem('env');
      console.log('🔍 Raw env string from localStorage:', envStr);
      
      const env = envStr ? JSON.parse(envStr) : {};
      console.log('🔍 Parsed env object:', env);
      
      const client_name = env.CLIENT_NAME || 'default_client';
      const app_name = env.APP_NAME || 'default_app';
      const project_name = env.PROJECT_NAME || 'default_project';
      
      console.log('🔍 Extracted from localStorage:', { client_name, app_name, project_name });
      
      // Check if we have real values or just defaults
      const hasRealValues = client_name !== 'default_client' || 
                           app_name !== 'default_app' || 
                           project_name !== 'default_project';
      
      console.log('🔍 Has real values:', hasRealValues);

      // Try to load with current values first
      let response = await fetch(`${MOLECULES_API}/workflow/get`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          user_id: '',
          client_name: client_name,
          app_name: app_name,
          project_name: project_name
        })
      });

      console.log('📡 API response status:', response.status);
      console.log('📡 API response ok:', response.ok);

      if (response.ok) {
        const result = await response.json();
        console.log('📡 API response data:', result);
        
        if (result.workflow_data) {
          const { workflow_name, canvas_molecules, custom_molecules, standalone_cards } = result.workflow_data;
          
          // Load ALL molecules (active + inactive) into state
          // Filtering happens only when displaying (e.g., in WorkflowCanvas)
          // This preserves the isActive state and prevents position shifting
          const allCanvasMolecules = (canvas_molecules || []).map((mol: any) => ({
            ...mol,
            isActive: mol.isActive !== false // Default to true if not specified
          }));
          const allCustomMolecules = (custom_molecules || []).map((mol: any) => ({
            ...mol,
            isActive: mol.isActive !== false
          }));
          
          const activeCount = allCanvasMolecules.filter((mol: any) => mol.isActive !== false).length;
          console.log(`📦 Loaded workflow molecules: ${allCanvasMolecules.length} total (${activeCount} active, ${allCanvasMolecules.length - activeCount} inactive)`);
          
          // Update state with all molecules (active + inactive)
          setWorkflowName(workflow_name || 'Untitled Workflow');
          setCanvasMolecules(allCanvasMolecules);
          setCustomMolecules(allCustomMolecules);
          setStandaloneCards(standalone_cards || []);
          
          toast({
            title: "Workflow Loaded",
            description: `Workflow "${workflow_name || 'Untitled Workflow'}" has been loaded successfully`,
          });
          console.log('Workflow loaded:', result.workflow_data);
          return true; // Data was loaded successfully
        } else {
          console.log('📡 No workflow_data in response');
          
          // If we used default values and got no data, try without any filters
          if (!hasRealValues) {
            console.log('🔄 Trying to load any workflow without filters...');
            response = await fetch(`${MOLECULES_API}/workflow/get`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              credentials: 'include',
              body: JSON.stringify({
                user_id: '',
                client_name: '',
                app_name: '',
                project_name: ''
              })
            });
            
            if (response.ok) {
              const fallbackResult = await response.json();
              console.log('📡 Fallback API response data:', fallbackResult);
              
              if (fallbackResult.workflow_data) {
                const { canvas_molecules, custom_molecules, standalone_cards } = fallbackResult.workflow_data;
                console.log('📡 Found fallback workflow data - canvas_molecules:', canvas_molecules?.length || 0, 'custom_molecules:', custom_molecules?.length || 0, 'standalone_cards:', standalone_cards?.length || 0);
                
                // Load ALL molecules (active + inactive) into state
                const allCanvasMolecules = (canvas_molecules || []).map((mol: any) => ({
                  ...mol,
                  isActive: mol.isActive !== false
                }));
                const allCustomMolecules = (custom_molecules || []).map((mol: any) => ({
                  ...mol,
                  isActive: mol.isActive !== false
                }));
                
                const activeCount = allCanvasMolecules.filter((mol: any) => mol.isActive !== false).length;
                console.log(`📦 Loaded fallback workflow molecules: ${allCanvasMolecules.length} total (${activeCount} active, ${allCanvasMolecules.length - activeCount} inactive)`);
                
                // Update state with all molecules (active + inactive)
                setCanvasMolecules(allCanvasMolecules);
                setCustomMolecules(allCustomMolecules);
                setStandaloneCards(standalone_cards || []);
                
                if (showToast) {
                  toast({
                    title: "Workflow Loaded",
                    description: `Workflow configuration has been loaded successfully`,
                  });
                }
                console.log('Fallback workflow loaded:', fallbackResult.workflow_data);
                return true; // Data was loaded successfully
              }
            }
          }
          
          if (showToast) {
            toast({
              title: "No Saved Workflow",
              description: "No saved workflow configuration found for this project",
              variant: "destructive",
            });
          }
          return false; // No data found
        }
      } else {
        console.log('📡 API request failed with status:', response.status);
        throw new Error('Failed to load workflow');
      }
    } catch (error) {
      console.error('Error loading workflow:', error);
      if (showToast) {
        toast({
          title: "Load Failed",
          description: "Failed to load workflow configuration. Please try again.",
          variant: "destructive",
        });
      }
      return false; // Failed to load
    }
  };

  // Load workflow state on component mount - MongoDB is the single source of truth
  // No localStorage fallback to prevent confusion when user clears and saves data
  useEffect(() => {
    loadWorkflowConfiguration(false).catch(error => {
      console.error('Error loading workflow from MongoDB:', error);
      // Don't fall back to localStorage - show empty canvas
      // This ensures that if user deletes data and saves, they won't see old localStorage data
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Function to show confirmation dialog before clearing
  const clearWorkflowData = () => {
    setClearConfirmDialogOpen(true);
  };

  // Function to actually perform the clear operation
  const performClearWorkflowData = async () => {
    setClearConfirmDialogOpen(false);
    try {
      // Get project context for MongoDB operations
      const projectContext = getActiveProjectContext();
      const envStr = localStorage.getItem('env');
      const env = envStr ? JSON.parse(envStr) : {};
      const client_name = env.CLIENT_NAME || projectContext?.client_name || 'default_client';
      const app_name = env.APP_NAME || projectContext?.app_name || 'default_app';
      const project_name = env.PROJECT_NAME || projectContext?.project_name || 'default_project';

      // Clear local state first
    setCanvasMolecules([]);
    setCustomMolecules([]);
      setStandaloneCards([]);
    setWorkflowName('Untitled Workflow');
      
      // Clear localStorage (even though we don't load from it, we still write to it for backup)
    localStorage.removeItem('workflow-canvas-molecules');
    localStorage.removeItem('workflow-custom-molecules');
      localStorage.removeItem('workflow-standalone-cards');
    localStorage.removeItem('workflow-name');
      localStorage.removeItem('workflow-molecules'); // Clear workflow molecules used for Lab Mode sorting

      // Clear workflow configuration from MongoDB
      console.log('🗑️ Clearing workflow configuration from MongoDB...');
      try {
        await fetch(`${MOLECULES_API}/workflow/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            workflow_name: 'Untitled Workflow',
            canvas_molecules: [],
            custom_molecules: [],
            standalone_cards: [],
            user_id: '',
            client_name: client_name,
            app_name: app_name,
            project_name: project_name
          })
        });
        console.log('✅ Workflow configuration cleared from MongoDB');
      } catch (error) {
        console.error('⚠️ Failed to clear workflow configuration from MongoDB:', error);
      }

      // Clear Laboratory Mode configuration from MongoDB
      console.log('🗑️ Clearing Laboratory Mode configuration from MongoDB...');
      try {
        await fetch(`${LABORATORY_PROJECT_STATE_API}/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            client_name: client_name,
            app_name: app_name,
            project_name: project_name,
            cards: [], // Empty array clears all cards
            mode: 'laboratory',
          })
        });
        console.log('✅ Laboratory Mode configuration cleared from MongoDB');
      } catch (error) {
        console.error('⚠️ Failed to clear Laboratory Mode configuration from MongoDB:', error);
      }

    toast({
      title: 'Workflow Cleared',
        description: 'All molecules, standalone cards, and Laboratory Mode data have been cleared'
      });
    } catch (error) {
      console.error('❌ Error clearing workflow data:', error);
      toast({
        title: 'Clear Error',
        description: 'Some data may not have been cleared. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handleClearDialogOpenChange = (open: boolean) => {
    if (!open) {
      setClearConfirmDialogOpen(false);
    } else {
      setClearConfirmDialogOpen(true);
    }
  };

  // Create unique molecules list to avoid duplicates (only active molecules)
  const allMolecules = [...canvasMolecules.filter(mol => mol.isActive !== false).map(m => ({ id: m.id, title: m.title }))];

  // Get all assigned atoms from molecules - this determines which atoms are hidden in the library (only active molecules)
  const assignedAtoms = canvasMolecules.filter(mol => mol.isActive !== false).flatMap(molecule => molecule.atoms || []);

  const renderWorkflow = () => {
    console.log('Rendering workflow with molecules:', canvasMolecules);

    // Ensure every molecule is part of a flow (has an incoming or outgoing connection)
    const unconnected = canvasMolecules.filter((molecule) => {
      const hasOutgoing = molecule.connections && molecule.connections.length > 0;
      const hasIncoming = canvasMolecules.some((m) =>
        m.connections?.some((c: { target: string }) => c.target === molecule.id)
      );
      return !hasOutgoing && !hasIncoming;
    });

    if (unconnected.length > 0) {
      toast({
        title: 'Incomplete workflow',
        description: 'Connect all molecules before rendering the workflow.',
        variant: 'destructive'
      });
      return;
    }

    // Topologically sort molecules based on connections
    const graph: Record<string, string[]> = {};
    const inDegree: Record<string, number> = {};
    canvasMolecules.forEach(m => {
      graph[m.id] = m.connections?.map((c: { target: string }) => c.target) || [];
      if (inDegree[m.id] === undefined) inDegree[m.id] = 0;
    });
    canvasMolecules.forEach(m => {
      m.connections?.forEach((c: { target: string }) => {
        inDegree[c.target] = (inDegree[c.target] || 0) + 1;
      });
    });

    const queue = Object.keys(inDegree).filter(id => inDegree[id] === 0);
    const orderedIds: string[] = [];
    while (queue.length) {
      const id = queue.shift() as string;
      orderedIds.push(id);
      graph[id].forEach(target => {
        inDegree[target] -= 1;
        if (inDegree[target] === 0) queue.push(target);
      });
    }

    if (orderedIds.length !== canvasMolecules.length) {
      toast({
        title: 'Invalid workflow',
        description: 'Workflow contains cycles. Please fix connections.',
        variant: 'destructive'
      });
      return;
    }

    const idToMolecule: Record<string, any> = {};
    canvasMolecules.forEach(m => {
      idToMolecule[m.id] = m;
    });

    const orderedMolecules = orderedIds.map(id => idToMolecule[id]);

    const selectedAtoms: SelectedAtom[] = [];
    orderedMolecules.forEach(molecule => {
      molecule.atomOrder.forEach((atomName: string, index: number) => {
        if (molecule.selectedAtoms[atomName]) {
          selectedAtoms.push({
            atomName,
            moleculeId: molecule.id,
            moleculeTitle: molecule.title,
            order: index
          });
        }
      });
    });

    if (selectedAtoms.length === 0) {
      toast({
        title: "No atoms selected",
        description: "Please select at least one atom from the molecules to render.",
        variant: "destructive"
      });
      return;
    }

    // Persist selected atoms for Laboratory mode and clear previous layout
    localStorage.setItem('workflow-selected-atoms', safeStringify(selectedAtoms));
    localStorage.removeItem('laboratory-layout-cards');

    toast({
      title: 'Workflow Rendered',
      description: `Successfully rendered ${selectedAtoms.length} atoms to Laboratory mode.`
    });

    console.log('Selected atoms for rendering:', selectedAtoms);

    navigate('/laboratory');
  };

  return (
    <div className="h-screen bg-muted/30 flex flex-col">
      <div className="relative z-30">
        <Header />
      </div>
      
      {/* Workflow Header */}
      <div className="bg-card border-b border-border px-8 py-6 flex-shrink-0 relative z-20">
        <div className="flex items-center justify-between">
          <div className="flex-1 max-w-2xl">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-semibold text-foreground">Workflow Mode</h1>
            </div>
            <p className="text-muted-foreground">
              Drag molecules from the list onto the workflow canvas. Connect molecules by drawing arrows between them.
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={clearWorkflowData}>
              Clear
            </Button>
            <Button variant="outline" size="sm" onClick={() => loadWorkflowConfiguration(true)}>
              <Upload className="w-4 h-4 mr-2" />
              Load
            </Button>
            <Button variant="outline" size="sm" onClick={saveWorkflowConfiguration}>
              <Save className="w-4 h-4 mr-2" />
              Save
            </Button>
            <Button variant="outline" size="sm">
              <Share2 className="w-4 h-4 mr-2" />
              Share
            </Button>
            <Button
              className="bg-foreground hover:bg-foreground/90 text-background px-8 py-6 text-base shadow-sm"
              onClick={handleRenderWorkflow}
            >
              <Play className="w-5 h-5 mr-2" />
              Render Workflow
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-visible" style={{ minHeight: 0 }}>
        {/* Molecule Library - LEFT SIDE */}
        {isLibraryVisible && (
          <div className="w-80 bg-card border-r border-border flex flex-col">
            <MoleculeList canEdit={true} onToggle={toggleLibraryVisibility} />
          </div>
        )}

        {/* Library Toggle Button - Show when library is hidden */}
        {!isLibraryVisible && (
          <div className="absolute left-0 z-10" style={{ top: '190px', height: 'calc(100vh - 190px)' }}>
             <div className="bg-white border-r border-gray-200 transition-all duration-300 flex flex-col w-12 h-full">
              <div className="p-3 flex items-center justify-center">
                <button
                  onClick={toggleLibraryVisibility}
                  className="inline-flex items-center justify-center p-1 h-8 w-8 rounded-md hover:bg-accent hover:text-accent-foreground"
                  title="Open Molecule Library"
                  data-molecule-sidebar-toggle="true"
                >
                  <Grid3X3 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Workflow Canvas - MAIN AREA */}
        <div
          className={`flex-1 p-6 relative transition-all duration-300 ${isLibraryVisible ? 'ml-0' : 'ml-0'}`}
          style={{ zIndex: 0 }}
        >
          <WorkflowCanvas
            onMoleculeSelect={handleMoleculeSelect}
            onCreateMolecule={handleCreateMolecule}
            canvasMolecules={canvasMolecules.filter(mol => mol.isActive !== false)} // Filter out inactive molecules for display
            standaloneChips={standaloneCards}
            onStandaloneCardRemove={handleStandaloneCardRemove}
            onMoveAtomToMolecule={handleMoveAtomToMolecule}
            onMoveAtomToAtomList={handleMoveAtomToAtomList}
            onMoleculeRemove={handleMoleculeRemove}
            onMoleculeRename={handleRenameMolecule}
            onMoleculeAdd={handleMoleculeAdd}
            onMoleculeReplace={handleMoleculeReplace}
            onMoleculePositionsUpdate={handleMoleculePositionsUpdate}
            onInsertMolecule={handleInsertMolecule}
            onAtomOrderChange={handleAtomOrderChange}
            isLibraryVisible={isLibraryVisible}
            isRightPanelVisible={isRightPanelVisible}
            isAtomLibraryVisible={isAtomLibraryVisible}
            isRightPanelToolVisible={isRightPanelToolVisible}
          />
        </div>

        {/* Right Side Panel with Icons - Always Visible */}
        <div className="h-full overflow-visible relative z-20">
          <WorkflowRightPanel 
            molecules={allMolecules}
            onAtomAssignToMolecule={handleAtomAssignToMolecule}
            onMultipleAtomsAssignToMolecule={handleMultipleAtomsAssignToMolecule}
            assignedAtoms={assignedAtoms}
            onAtomLibraryVisibilityChange={handleAtomLibraryVisibilityChange}
            onRightPanelToolVisibilityChange={handleRightPanelToolVisibilityChange}
            onMoleculeAdd={handleMoleculeAdd}
            onRenderWorkflow={handleRenderWorkflow}
            onCheckCanvasHasMolecules={checkCanvasHasMolecules}
            onGetAICreatedMolecules={getAICreatedMolecules}
            onClearAIMolecules={clearAICreatedMolecules}
            onGetRightmostPosition={getRightmostMoleculePosition}
          />
        </div>

      </div>

      {/* Clear Confirmation Dialog */}
      <ConfirmationDialog
        open={clearConfirmDialogOpen}
        onOpenChange={handleClearDialogOpenChange}
        onConfirm={performClearWorkflowData}
        onCancel={() => setClearConfirmDialogOpen(false)}
        title="Clear Workflow?"
        description="This will permanently delete all molecules, standalone cards, and data in both Workflow Mode and Laboratory Mode. This action cannot be undone."
        icon={<AlertTriangle className="w-6 h-6 text-white" />}
        confirmLabel="Yes, Clear All"
        cancelLabel="Cancel"
        iconBgClass="bg-red-500"
        confirmButtonClass="bg-red-500 hover:bg-red-600"
      />

      {/* Atom Removal Confirmation Dialog */}
      <ConfirmationDialog
        open={atomRemoveConfirmDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setAtomRemoveConfirmDialogOpen(false);
            setPendingAtomRemoval(null);
          }
        }}
        onConfirm={performAtomRemoval}
        onCancel={() => {
          setAtomRemoveConfirmDialogOpen(false);
          setPendingAtomRemoval(null);
        }}
        title="Remove Atom?"
        description="This atom will be removed from the molecule. When you save the workflow, this change will reflect in Laboratory Mode."
        icon={<AlertTriangle className="w-6 h-6 text-white" />}
        confirmLabel="Yes, Remove"
        cancelLabel="Cancel"
        iconBgClass="bg-orange-500"
        confirmButtonClass="bg-orange-500 hover:bg-orange-600"
      />

      {/* Molecule Removal Confirmation Dialog */}
      <ConfirmationDialog
        open={moleculeRemoveConfirmDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setMoleculeRemoveConfirmDialogOpen(false);
            setPendingMoleculeRemoval(null);
          }
        }}
        onConfirm={performMoleculeRemoval}
        onCancel={() => {
          setMoleculeRemoveConfirmDialogOpen(false);
          setPendingMoleculeRemoval(null);
        }}
        title="Remove Molecule?"
        description={`This molecule will be removed from the workflow. When you save the workflow, this change will reflect in Laboratory Mode.`}
        icon={<AlertTriangle className="w-6 h-6 text-white" />}
        confirmLabel="Yes, Remove"
        cancelLabel="Cancel"
        iconBgClass="bg-orange-500"
        confirmButtonClass="bg-orange-500 hover:bg-orange-600"
      />

    </div>
  );
};

export default WorkflowMode;