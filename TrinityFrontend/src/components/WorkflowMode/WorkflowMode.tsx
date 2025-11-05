
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
      // OR chips with beforeFirstMolecule if reference is the first molecule
      chipsBeforeReference = standaloneCards.filter(chip => {
        // Chip is between previous molecule and reference
        if (chip.betweenMolecules && Array.isArray(chip.betweenMolecules) && chip.betweenMolecules.length === 2) {
          return chip.betweenMolecules[1] === referenceMoleculeId;
        }
        // Chip is before the reference molecule
        if (chip.beforeMoleculeId === referenceMoleculeId) {
          return true;
        }
        // Chip is before first molecule and reference is the first molecule
        if (chip.beforeFirstMolecule && referenceIndex === 0) {
          return true;
        }
        return false;
      });
      
      if (chipsBeforeReference.length > 0) {
        // There are chips that should appear immediately before the reference molecule
        // Insert the new molecule right before the reference (after the chips)
        // The chips will still be positioned before the reference, but will appear before the new molecule visually
        // So the visual order will be: previous molecule, chips, NEW_MOLECULE, reference
        insertIndex = referenceIndex;
        console.log(`📍 Inserting "${finalName}" before "${canvasMolecules[referenceIndex]?.title}" (${chipsBeforeReference.length} standalone chips will precede)`);
      } else {
        // No chips immediately before reference - insert normally
        insertIndex = referenceIndex;
      }
    } else {
      // Insert to the RIGHT of the reference molecule
      // Check if there are standalone chips that should appear immediately after this molecule
      // Chips with betweenMolecules where the first molecule is the reference
      // OR chips with afterMoleculeId matching the reference (and not afterLastMolecule)
      chipsAfterReference = standaloneCards.filter(chip => {
        // Chip is between reference and another molecule
        if (chip.betweenMolecules && Array.isArray(chip.betweenMolecules) && chip.betweenMolecules.length === 2) {
          return chip.betweenMolecules[0] === referenceMoleculeId;
        }
        // Chip is after the reference molecule (and not after last molecule)
        if (chip.afterMoleculeId === referenceMoleculeId && !chip.afterLastMolecule) {
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
    if (position === 'right' && chipsAfterReference.length > 0) {
      // Chips that were "between reference and nextMolecule" should now be "between NEW_MOLECULE and nextMolecule"
      setStandaloneCards(prev => prev.map(chip => {
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
      console.log(`🔄 Updated ${chipsAfterReference.length} standalone chip references to position after new molecule "${finalName}"`);
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
        if (chip.beforeMoleculeId === referenceMoleculeId) {
          // Find the previous molecule before reference
          const previousMoleculeIndex = referenceIndex - 1; // Before insertion, previous was at referenceIndex - 1
          if (previousMoleculeIndex >= 0) {
            const previousMolecule = canvasMolecules[previousMoleculeIndex];
            if (previousMolecule) {
              // Chip should now be between previousMolecule and NEW_MOLECULE
              return {
                ...chip,
                betweenMolecules: [previousMolecule.id, moleculeId] as [string, string],
                afterMoleculeId: previousMolecule.id,
                beforeMoleculeId: moleculeId
              };
            }
          } else {
            // Reference was the first molecule - chip should now be before NEW_MOLECULE (which becomes first)
            return {
              ...chip,
              beforeFirstMolecule: true,
              beforeMoleculeId: moleculeId,
              betweenMolecules: undefined,
              afterMoleculeId: undefined
            };
          }
        }
        // Update chips that were before first molecule (and reference is first)
        if (chip.beforeFirstMolecule && referenceIndex === 0) {
          // Chip should now be before NEW_MOLECULE (which becomes first)
          return {
            ...chip,
            beforeFirstMolecule: true,
            beforeMoleculeId: moleculeId
          };
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
    setCustomMolecules(prev => 
      prev.map(mol => {
        const atoms = Array.isArray(mol.atoms) ? mol.atoms : [];
        return mol.id === moleculeId && !atoms.includes(atomId)
          ? { 
              ...mol, 
              atoms: [...atoms, atomId],
              atomOrder: [...(Array.isArray(mol.atomOrder) ? mol.atomOrder : []), atomId],
              selectedAtoms: { ...(mol.selectedAtoms || {}), [atomId]: false }
            }
          : mol;
      })
    );
    
    // Also update canvasMolecules to reflect the atom assignment
    setCanvasMolecules(prev => 
      prev.map(mol => {
        const atoms = Array.isArray(mol.atoms) ? mol.atoms : [];
        return mol.id === moleculeId && !atoms.includes(atomId)
          ? { 
              ...mol, 
              atoms: [...atoms, atomId],
              atomOrder: [...(Array.isArray(mol.atomOrder) ? mol.atomOrder : []), atomId],
              selectedAtoms: { ...(mol.selectedAtoms || {}), [atomId]: false }
            }
          : mol;
      })
    );
    
    const molecule = customMolecules.find(m => m.id === moleculeId);
    toast({
      title: 'Atom Added',
      description: `Atom has been added to "${molecule?.title || 'molecule'}"`
    });
  };

  const handleMultipleAtomsAssignToMolecule = (atomIds: string[], moleculeId: string) => {
    const targetMolecule = customMolecules.find(m => m.id === moleculeId);
    const targetAtoms = Array.isArray(targetMolecule?.atoms) ? targetMolecule.atoms : [];
    const newAtomIds = atomIds.filter(id => !targetAtoms.includes(id));
    
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
    
    const molecule = customMolecules.find(m => m.id === moleculeId);
    toast({
      title: 'Atoms Added',
      description: `${newAtomIds.length} atoms have been added to "${molecule?.title || 'molecule'}"`
    });
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

  // Handle moving atom back to atom list
  const handleMoveAtomToAtomList = (atomId: string, fromMoleculeId: string) => {
    console.log('Moving atom to atom list:', atomId, 'from molecule:', fromMoleculeId);
    
    // Update customMolecules state
    setCustomMolecules(prev => 
      prev.map(mol => 
        mol.id === fromMoleculeId
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
        mol.id === fromMoleculeId
          ? {
              ...mol,
              atoms: (Array.isArray(mol.atoms) ? mol.atoms : []).filter(id => id !== atomId),
              atomOrder: (Array.isArray(mol.atomOrder) ? mol.atomOrder : []).filter(id => id !== atomId),
              selectedAtoms: { ...(mol.selectedAtoms || {}), [atomId]: false }
            }
          : mol
      )
    );

    toast({
      title: 'Atom Moved',
      description: `Atom has been moved back to the Atom List`
    });
  };

  // Handle molecule removal - mark as isActive: false instead of removing
  const handleMoleculeRemove = (moleculeId: string) => {
    // Get the index of the molecule being deleted BEFORE marking it as inactive
    const deletedIndex = canvasMolecules.findIndex(mol => mol.id === moleculeId);
    const moleculeBeforeDeleted = deletedIndex > 0 ? canvasMolecules[deletedIndex - 1] : null;
    const moleculeAfterDeleted = deletedIndex < canvasMolecules.length - 1 ? canvasMolecules[deletedIndex + 1] : null;
    
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
    
    // Update standalone chips that reference the deleted molecule
    setStandaloneCards(prev => prev.map(card => {
      // Case 1: Chip is between two molecules and one is deleted
      if (card.betweenMolecules && Array.isArray(card.betweenMolecules)) {
        const [firstId, secondId] = card.betweenMolecules;
        
        if (firstId === moleculeId && secondId === moleculeId) {
          // Both references point to deleted molecule (edge case)
          // Remove the chip as it has no valid position
          return null;
        } else if (firstId === moleculeId) {
          // Deleted molecule was the first - chip should be between moleculeBeforeDeleted and secondId
          if (moleculeBeforeDeleted && moleculeBeforeDeleted.id !== secondId) {
            return {
              ...card,
              betweenMolecules: [moleculeBeforeDeleted.id, secondId] as [string, string],
              afterMoleculeId: moleculeBeforeDeleted.id,
              beforeMoleculeId: secondId
            };
          } else {
            // No molecule before deleted one - place before secondId
            const willBeFirstMolecule = deletedIndex === 0;
            if (willBeFirstMolecule) {
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
                afterMoleculeId: undefined
              };
            }
          }
        } else if (secondId === moleculeId) {
          // Deleted molecule was the second - chip should be between firstId and moleculeAfterDeleted
          if (moleculeAfterDeleted && moleculeAfterDeleted.id !== firstId) {
            return {
              ...card,
              betweenMolecules: [firstId, moleculeAfterDeleted.id] as [string, string],
              afterMoleculeId: firstId,
              beforeMoleculeId: moleculeAfterDeleted.id
            };
          } else {
            // No molecule after deleted one - place after firstId
            const willBeLastMolecule = deletedIndex === canvasMolecules.length - 1;
            return {
              ...card,
              afterLastMolecule: true,
              afterMoleculeId: firstId,
              betweenMolecules: undefined,
              beforeMoleculeId: undefined
            };
          }
        }
      }
      
      // Case 2: Chip is after the deleted molecule
      if (card.afterMoleculeId === moleculeId) {
        if (moleculeBeforeDeleted) {
          const willBeLastMolecule = deletedIndex === canvasMolecules.length - 1;
          return {
            ...card,
            afterMoleculeId: moleculeBeforeDeleted.id,
            afterLastMolecule: willBeLastMolecule,
            betweenMolecules: moleculeAfterDeleted && moleculeAfterDeleted.id !== moleculeBeforeDeleted.id
              ? [moleculeBeforeDeleted.id, moleculeAfterDeleted.id] as [string, string]
              : undefined
          };
        } else if (moleculeAfterDeleted) {
          // Deleted was first molecule - chip should now be before the next one
          return {
            ...card,
            beforeFirstMolecule: true,
            beforeMoleculeId: moleculeAfterDeleted.id,
            afterMoleculeId: undefined,
            afterLastMolecule: false,
            betweenMolecules: undefined
          };
        }
      }
      
      // Case 3: Chip is before the deleted molecule
      if (card.beforeMoleculeId === moleculeId) {
        if (moleculeAfterDeleted) {
          return {
            ...card,
            beforeMoleculeId: moleculeAfterDeleted.id,
            beforeFirstMolecule: deletedIndex === 0,
            betweenMolecules: moleculeBeforeDeleted && moleculeBeforeDeleted.id !== moleculeAfterDeleted.id
              ? [moleculeBeforeDeleted.id, moleculeAfterDeleted.id] as [string, string]
              : undefined
          };
        } else {
          // Deleted was last molecule - chip should now be after the previous one
          const willBeLastMolecule = deletedIndex === canvasMolecules.length - 1;
          return {
            ...card,
            afterLastMolecule: true,
            afterMoleculeId: moleculeBeforeDeleted?.id,
            beforeMoleculeId: undefined,
            beforeFirstMolecule: false,
            betweenMolecules: undefined
          };
        }
      }
      
      // No references to deleted molecule - keep card as is
      return card;
    }).filter((card): card is NonNullable<typeof card> => card !== null)); // Remove null entries
    
    toast({
      title: 'Molecule Removed',
      description: 'Molecule has been removed from the canvas'
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

    // Prepare workflow molecules in the format expected by the helper function
    const workflowMolecules = moleculesWithAtoms.map(mol => ({
        id: mol.id,
        title: mol.title,
      atoms: mol.atoms.map(atomName => convertAtomNameToId(atomName)),
      atomOrder: (mol.atomOrder || mol.atoms).map(atomName => convertAtomNameToId(atomName))
    }));

    console.log('🔄 Converting workflow molecules to Laboratory cards format...');
    
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
    
    // Create a map of molecule IDs to their indices for calculating order
    const moleculeIdToIndexMap = new Map<string, number>();
    workflowMolecules.forEach((mol, index) => {
      moleculeIdToIndexMap.set(mol.id, index);
    });

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
      // Use grid approach: order = (moleculeIndex * 1000) + subOrder
      let order: number | undefined;
      
      if (standaloneChip.betweenMolecules && Array.isArray(standaloneChip.betweenMolecules) && standaloneChip.betweenMolecules.length === 2) {
        // Between two molecules: place after the first molecule
        const [firstMoleculeId] = standaloneChip.betweenMolecules;
        const moleculeIndex = moleculeIdToIndexMap.get(firstMoleculeId);
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
        const moleculeIndex = moleculeIdToIndexMap.get(standaloneChip.afterMoleculeId);
        if (moleculeIndex !== undefined) {
          if (standaloneChip.afterLastMolecule) {
            // After last molecule
            order = (workflowMolecules.length * 1000) + chipIndex + 1;
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
        const moleculeIndex = moleculeIdToIndexMap.get(standaloneChip.beforeMoleculeId);
        if (moleculeIndex !== undefined && moleculeIndex > 0) {
          const previousMoleculeIndex = moleculeIndex - 1;
          const existingChipsAfterPrevious = standaloneCards
            .slice(0, chipIndex)
            .filter(chip => {
              if (chip.afterMoleculeId) {
                const chipMoleculeIndex = moleculeIdToIndexMap.get(chip.afterMoleculeId);
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
        // After last molecule
        order = (workflowMolecules.length * 1000) + chipIndex + 1;
      } else if (typeof standaloneChip.position === 'number') {
        // Legacy position-based: convert to order
        const position = standaloneChip.position;
        if (position < 0 || (position >= 0 && position < 1)) {
          order = chipIndex;
        } else if (position >= workflowMolecules.length) {
          order = (workflowMolecules.length * 1000) + chipIndex + 1;
        } else {
          // Between molecules: position in range [i+1, i+2) means after molecule i
          for (let i = 0; i < workflowMolecules.length; i++) {
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
        // Default: after last molecule
        order = (workflowMolecules.length * 1000) + chipIndex + 1;
      }

      // Determine afterMoleculeId and beforeMoleculeId from standaloneChip
      let afterMoleculeId: string | undefined = undefined;
      let beforeMoleculeId: string | undefined = undefined;
      
      if (standaloneChip.betweenMolecules && standaloneChip.betweenMolecules.length >= 2) {
        // Between two molecules: first is afterMoleculeId, second is beforeMoleculeId
        afterMoleculeId = standaloneChip.betweenMolecules[0];
        beforeMoleculeId = standaloneChip.betweenMolecules[1];
      } else if (standaloneChip.afterMoleculeId) {
        // After a specific molecule
        afterMoleculeId = standaloneChip.afterMoleculeId;
        // Find next molecule for beforeMoleculeId if possible
        const moleculeIndex = moleculeIdToIndexMap.get(standaloneChip.afterMoleculeId);
        if (moleculeIndex !== undefined && moleculeIndex + 1 < workflowMolecules.length) {
          beforeMoleculeId = workflowMolecules[moleculeIndex + 1].id;
        }
      } else if (standaloneChip.beforeMoleculeId) {
        // Before a specific molecule: find previous molecule for afterMoleculeId
        const moleculeIndex = moleculeIdToIndexMap.get(standaloneChip.beforeMoleculeId);
        if (moleculeIndex !== undefined && moleculeIndex > 0) {
          afterMoleculeId = workflowMolecules[moleculeIndex - 1].id;
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
      
      const workflowMoleculeIds = new Set(workflowMolecules.map(m => m.id));
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
      // Create set of standalone card IDs from current workflow state
      const standaloneCardIds = new Set(standaloneCards.map(card => card.id));
      
      // Remove atoms that are no longer in workflow molecules
      // Remove cards for molecules that no longer exist in workflow
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

        // If molecule doesn't exist in workflow, remove it
        if (!workflowMoleculeIds.has(card.moleculeId)) {
          console.log(`🗑️ Removed card for deleted molecule: ${card.moleculeId}`);
          return false;
        }

        // If molecule exists in workflow, check if atom is still in workflow
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

        // Create a map of moleculeId to moleculeIndex for quick lookup
        const moleculeIndexMap = new Map<string, number>();
        molecules.forEach((molecule, index) => {
          moleculeIndexMap.set(molecule.id, index);
        });

        // Process each molecule in workflow order (preserves inserted molecule positions)
        molecules.forEach((molecule, moleculeIndex) => {
          // Add all workflow cards for this molecule first (maintain their relative order)
          const moleculeCards = workflowCards
            .filter(card => card.moleculeId === molecule.id)
            .sort((a, b) => {
              // Maintain original order within molecule
              const indexA = cardsToSort.findIndex(c => c.id === a.id);
              const indexB = cardsToSort.findIndex(c => c.id === b.id);
              return indexA - indexB;
            });
          sortedCards.push(...moleculeCards);

          // Find standalone cards that should appear after this molecule
          // Based on order field: order = (moleculeIndex * 1000) + subOrder
          const cardsAfterThisMolecule = standaloneCards.filter(card => {
            if (card.order !== undefined && typeof card.order === 'number') {
              const cardMoleculeIndex = Math.floor(card.order / 1000);
              return cardMoleculeIndex === moleculeIndex;
            }
            return false;
          });

          // Sort standalone cards by subOrder
          cardsAfterThisMolecule.sort((a, b) => {
            const subOrderA = a.order !== undefined ? a.order % 1000 : 0;
            const subOrderB = b.order !== undefined ? b.order % 1000 : 0;
            return subOrderA - subOrderB;
          });

          // Add standalone cards that appear after this molecule (between molecules)
          sortedCards.push(...cardsAfterThisMolecule);
        });

        // Add standalone cards that should appear after the last molecule (orphans)
        const placedStandaloneIds = new Set(sortedCards.map(c => c.id));
        const orphanCards = standaloneCards.filter(card => !placedStandaloneIds.has(card.id));
        sortedCards.push(...orphanCards);

        // Add any remaining workflow cards that weren't in any molecule (shouldn't happen, but safety check)
        const allProcessedIds = new Set(sortedCards.map(c => c.id));
        const remaining = cardsToSort.filter(c => !allProcessedIds.has(c.id));
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

      // Update afterMoleculeId and beforeMoleculeId for all standalone cards based on current molecule positions
      // This ensures that when molecules are inserted/deleted, standalone card references are updated correctly
      const updatedStandaloneCards = sortedFinalCards.map(card => {
        if (!card.moleculeId) {
          // This is a standalone card - update its molecule references
          let afterMoleculeId: string | undefined = undefined;
          let beforeMoleculeId: string | undefined = undefined;

          if (card.order !== undefined && typeof card.order === 'number') {
            const order = card.order;
            const moleculeIndex = Math.floor(order / 1000);

            if (moleculeIndex < 0) {
              // Before first molecule
              if (workflowMolecules.length > 0) {
                beforeMoleculeId = workflowMolecules[0].id;
              }
            } else if (moleculeIndex >= workflowMolecules.length) {
              // After last molecule
              if (workflowMolecules.length > 0) {
                afterMoleculeId = workflowMolecules[workflowMolecules.length - 1].id;
              }
            } else {
              // Between molecules: after moleculeIndex, before moleculeIndex + 1
              if (moleculeIndex >= 0 && moleculeIndex < workflowMolecules.length) {
                afterMoleculeId = workflowMolecules[moleculeIndex].id;
              }
              if (moleculeIndex + 1 < workflowMolecules.length) {
                beforeMoleculeId = workflowMolecules[moleculeIndex + 1].id;
              }
            }
          } else {
            // Fallback: use existing references or calculate from position
            // If card has existing afterMoleculeId, try to preserve it if molecule still exists
            if (card.afterMoleculeId) {
              const moleculeExists = workflowMolecules.some(m => m.id === card.afterMoleculeId);
              if (moleculeExists) {
                afterMoleculeId = card.afterMoleculeId;
                // Find next molecule for beforeMoleculeId
                const moleculeIndex = workflowMolecules.findIndex(m => m.id === card.afterMoleculeId);
                if (moleculeIndex >= 0 && moleculeIndex + 1 < workflowMolecules.length) {
                  beforeMoleculeId = workflowMolecules[moleculeIndex + 1].id;
                }
              } else if (workflowMolecules.length > 0) {
                // Molecule was deleted, default to after last molecule
                afterMoleculeId = workflowMolecules[workflowMolecules.length - 1].id;
              }
            } else if (card.beforeMoleculeId) {
              const moleculeExists = workflowMolecules.some(m => m.id === card.beforeMoleculeId);
              if (moleculeExists) {
                beforeMoleculeId = card.beforeMoleculeId;
                // Find previous molecule for afterMoleculeId
                const moleculeIndex = workflowMolecules.findIndex(m => m.id === card.beforeMoleculeId);
                if (moleculeIndex > 0) {
                  afterMoleculeId = workflowMolecules[moleculeIndex - 1].id;
                }
              } else if (workflowMolecules.length > 0) {
                // Molecule was deleted, default to after last molecule
                afterMoleculeId = workflowMolecules[workflowMolecules.length - 1].id;
              }
            } else if (workflowMolecules.length > 0) {
              // No references, default to after last molecule
              afterMoleculeId = workflowMolecules[workflowMolecules.length - 1].id;
            }
          }

          return {
            ...card,
            afterMoleculeId,
            beforeMoleculeId
          };
        }
        return card;
      });

      console.log('🔄 Updated standalone card molecule references:', {
        standaloneCount: updatedStandaloneCards.filter(c => !c.moleculeId).length,
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
      const saveUrl = `${LABORATORY_PROJECT_STATE_API}/save`;
      const savePayload = {
        client_name: projectContext.client_name,
        app_name: projectContext.app_name,
        project_name: projectContext.project_name,
        cards: updatedStandaloneCards, // Use updated cards with refreshed molecule references
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
      const workflowMoleculesForLab = workflowMolecules.map(mol => ({
        moleculeId: mol.id,
        moleculeTitle: mol.title,
        atoms: mol.atoms.map((atomId, index) => ({
          atomName: atomId,
          order: index
        }))
      }));
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
        toast({
          title: "Workflow Saved",
          description: `Workflow configuration has been saved successfully`,
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

    </div>
  );
};

export default WorkflowMode;