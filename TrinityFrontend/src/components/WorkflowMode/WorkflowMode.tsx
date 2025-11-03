
import React, { useState, useCallback, useEffect } from 'react';
import { safeStringify } from '@/utils/safeStringify';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Play, Save, Share2, Upload, ChevronLeft, ChevronRight, Grid3X3 } from 'lucide-react';
import Header from '@/components/Header';
import WorkflowCanvas from './components/WorkflowCanvas';
import MoleculeList from '@/components/MoleculeList/MoleculeList';
import WorkflowRightPanel from './components/WorkflowRightPanel';
import CreateMoleculeDialog from './components/CreateMoleculeDialog';
import { useToast } from '@/hooks/use-toast';
import { MOLECULES_API, LABORATORY_PROJECT_STATE_API } from '@/lib/api';
import { ReactFlowProvider } from 'reactflow';
import { convertWorkflowMoleculesToLaboratoryCards } from '../LaboratoryMode/components/CanvasArea/helpers';
import { getActiveProjectContext } from '@/utils/projectEnv';
import { LayoutCard } from '../LaboratoryMode/store/laboratoryStore';
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
  const { toast } = useToast();
  const navigate = useNavigate();

  // No pending-deletions tracking in Workflow Mode (banner removed)

  // Load workflow state on component mount - always try MongoDB first, then localStorage
  useEffect(() => {
    const loadWorkflowData = async () => {
      console.log('🚀 Component mounted - attempting to load workflow data');
      
      try {
        // Always try MongoDB first (silent mode)
        console.log('📡 Attempting to load from MongoDB...');
        const mongoDataLoaded = await loadWorkflowConfiguration(false);
        
        if (mongoDataLoaded) {
          console.log('✅ MongoDB data loaded successfully');
          // Mark session as active after successful MongoDB load
          sessionStorage.setItem('workflow-session-active', 'true');
          return; // Exit early if MongoDB data was loaded
        }
        
        console.log('⚠️ MongoDB returned no data, falling back to localStorage');
        // Fallback to localStorage if MongoDB has no data
        const savedCanvasMolecules = localStorage.getItem('workflow-canvas-molecules');
        const savedCustomMolecules = localStorage.getItem('workflow-custom-molecules');
        const savedWorkflowName = localStorage.getItem('workflow-name');
        
        if (savedCanvasMolecules) {
          try {
            const parsed = JSON.parse(savedCanvasMolecules);
            setCanvasMolecules(parsed);
            console.log('📦 Fallback: Loaded workflow from localStorage');
          } catch (error) {
            console.error('Error loading canvas molecules from localStorage:', error);
          }
        }
        
        if (savedCustomMolecules) {
          try {
            const parsed = JSON.parse(savedCustomMolecules);
            setCustomMolecules(parsed);
            console.log('📦 Fallback: Loaded custom molecules from localStorage');
          } catch (error) {
            console.error('Error loading custom molecules from localStorage:', error);
          }
        }
        
        if (savedWorkflowName) {
          setWorkflowName(savedWorkflowName);
        }
        
        // Mark session as active after loading (either from MongoDB or localStorage)
        sessionStorage.setItem('workflow-session-active', 'true');
        
      } catch (error) {
        console.error('❌ Error loading workflow data:', error);
        
        // Fallback to localStorage only
        const savedCanvasMolecules = localStorage.getItem('workflow-canvas-molecules');
        const savedCustomMolecules = localStorage.getItem('workflow-custom-molecules');
        const savedWorkflowName = localStorage.getItem('workflow-name');
        
        if (savedCanvasMolecules) {
          try {
            const parsed = JSON.parse(savedCanvasMolecules);
            setCanvasMolecules(parsed);
            console.log('📦 Error fallback: Loaded workflow from localStorage');
          } catch (error) {
            console.error('Error loading canvas molecules from localStorage:', error);
          }
        }
        
        if (savedCustomMolecules) {
          try {
            const parsed = JSON.parse(savedCustomMolecules);
            setCustomMolecules(parsed);
            console.log('📦 Error fallback: Loaded custom molecules from localStorage');
          } catch (error) {
            console.error('Error loading custom molecules from localStorage:', error);
          }
        }
        
        if (savedWorkflowName) {
          setWorkflowName(savedWorkflowName);
        }
        
        // Mark session as active even after error fallback
        sessionStorage.setItem('workflow-session-active', 'true');
      }
    };

    loadWorkflowData();
  }, []);

  // Cleanup session storage when component unmounts (app close/refresh)
  useEffect(() => {
    const handleBeforeUnload = () => {
      sessionStorage.removeItem('workflow-session-active');
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // Save workflow state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('workflow-canvas-molecules', JSON.stringify(canvasMolecules));
  }, [canvasMolecules]);

  useEffect(() => {
    localStorage.setItem('workflow-custom-molecules', JSON.stringify(customMolecules));
  }, [customMolecules]);

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
    setCanvasMolecules(prev => [...prev, moleculeData]);
    console.log(`✅ Added molecule "${moleculeData.title}" to canvasMolecules with position:`, moleculeData.position);
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
    
    // No cross-sync tracking needed in Workflow Mode
    
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

  // Handle molecule removal
  const handleMoleculeRemove = (moleculeId: string) => {
    // No cross-sync tracking needed in Workflow Mode
    
    // Get current molecule order BEFORE deletion to calculate new positions
    const currentMolecules = [...canvasMolecules];
    const deletedIndex = currentMolecules.findIndex(mol => mol.id === moleculeId);
    const moleculeBeforeDeleted = deletedIndex > 0 ? currentMolecules[deletedIndex - 1] : null;
    const moleculeAfterDeleted = deletedIndex < currentMolecules.length - 1 ? currentMolecules[deletedIndex + 1] : null;
    
    // Update standalone chips that reference the deleted molecule
    // Preserve position by finding neighboring molecules
    setStandaloneCards(prev => {
      return prev.map(card => {
        let needsUpdate = false;
        const updatedCard = { ...card };
        
        // Case 1: Chip is between two molecules where one is deleted
        if (card.betweenMolecules && Array.isArray(card.betweenMolecules)) {
          const [firstId, secondId] = card.betweenMolecules;
          
          if (firstId === moleculeId && secondId === moleculeId) {
            // Both references point to deleted molecule (edge case)
            // Move to after last molecule as fallback
            updatedCard.betweenMolecules = undefined;
            updatedCard.afterLastMolecule = true;
            updatedCard.afterMoleculeId = undefined;
            updatedCard.beforeMoleculeId = undefined;
            needsUpdate = true;
            console.log(`🔄 Moving standalone chip "${card.id}" to after last molecule (both molecules in pair were deleted)`);
          } else if (firstId === moleculeId) {
            // Deleted molecule was the first - chip should be between moleculeBeforeDeleted and secondId
            if (moleculeBeforeDeleted && moleculeBeforeDeleted.id !== secondId) {
              // Can preserve between position
              updatedCard.betweenMolecules = [moleculeBeforeDeleted.id, secondId];
              updatedCard.afterMoleculeId = undefined;
              updatedCard.beforeMoleculeId = undefined;
              needsUpdate = true;
              console.log(`🔄 Preserving chip "${card.id}" position: between "${moleculeBeforeDeleted.id}" and "${secondId}" (molecule "${firstId}" was deleted)`);
            } else {
              // No molecule before, move to before secondId
              updatedCard.betweenMolecules = undefined;
              updatedCard.beforeMoleculeId = secondId;
              updatedCard.afterMoleculeId = undefined;
              needsUpdate = true;
              console.log(`🔄 Moving chip "${card.id}" to before molecule "${secondId}" (no molecule before deleted one)`);
            }
          } else if (secondId === moleculeId) {
            // Deleted molecule was the second - chip should be between firstId and moleculeAfterDeleted
            if (moleculeAfterDeleted && moleculeAfterDeleted.id !== firstId) {
              // Can preserve between position
              updatedCard.betweenMolecules = [firstId, moleculeAfterDeleted.id];
              updatedCard.afterMoleculeId = undefined;
              updatedCard.beforeMoleculeId = undefined;
              needsUpdate = true;
              console.log(`🔄 Preserving chip "${card.id}" position: between "${firstId}" and "${moleculeAfterDeleted.id}" (molecule "${secondId}" was deleted)`);
            } else {
              // No molecule after, move to after firstId
              updatedCard.betweenMolecules = undefined;
              updatedCard.afterMoleculeId = firstId;
              updatedCard.beforeMoleculeId = undefined;
              needsUpdate = true;
              console.log(`🔄 Moving chip "${card.id}" to after molecule "${firstId}" (no molecule after deleted one)`);
            }
          }
        }
        
        // Case 2: Chip is after the deleted molecule
        if (card.afterMoleculeId === moleculeId) {
          if (moleculeBeforeDeleted) {
            // Preserve position by moving to after the molecule before deleted one
            updatedCard.afterMoleculeId = moleculeBeforeDeleted.id;
            updatedCard.beforeMoleculeId = undefined;
            updatedCard.afterLastMolecule = false;
            needsUpdate = true;
            console.log(`🔄 Preserving chip "${card.id}" position: after "${moleculeBeforeDeleted.id}" (was after deleted "${moleculeId}")`);
          } else if (moleculeAfterDeleted) {
            // No molecule before, but there's one after - position before it
            updatedCard.afterMoleculeId = undefined;
            updatedCard.beforeMoleculeId = moleculeAfterDeleted.id;
            updatedCard.afterLastMolecule = false;
            needsUpdate = true;
            console.log(`🔄 Moving chip "${card.id}" to before "${moleculeAfterDeleted.id}" (deleted was first molecule)`);
          } else {
            // No neighboring molecules - move to after last as fallback
            updatedCard.afterMoleculeId = undefined;
            updatedCard.afterLastMolecule = true;
            updatedCard.beforeMoleculeId = undefined;
            needsUpdate = true;
            console.log(`🔄 Moving chip "${card.id}" to after last molecule (no neighbors found)`);
          }
        }
        
        // Case 3: Chip is before the deleted molecule
        if (card.beforeMoleculeId === moleculeId) {
          if (moleculeAfterDeleted) {
            // Preserve position by moving to before the molecule after deleted one
            updatedCard.beforeMoleculeId = moleculeAfterDeleted.id;
            updatedCard.afterMoleculeId = undefined;
            updatedCard.beforeFirstMolecule = false;
            needsUpdate = true;
            console.log(`🔄 Preserving chip "${card.id}" position: before "${moleculeAfterDeleted.id}" (was before deleted "${moleculeId}")`);
          } else if (moleculeBeforeDeleted) {
            // No molecule after, but there's one before - position after it
            updatedCard.beforeMoleculeId = undefined;
            updatedCard.afterMoleculeId = moleculeBeforeDeleted.id;
            updatedCard.beforeFirstMolecule = false;
            needsUpdate = true;
            console.log(`🔄 Moving chip "${card.id}" to after "${moleculeBeforeDeleted.id}" (deleted was last molecule)`);
          } else {
            // No neighboring molecules - move to before first as fallback
            updatedCard.beforeMoleculeId = undefined;
            updatedCard.beforeFirstMolecule = true;
            updatedCard.afterMoleculeId = undefined;
            needsUpdate = true;
            console.log(`🔄 Moving chip "${card.id}" to before first molecule (no neighbors found)`);
          }
        }
        
        return needsUpdate ? updatedCard : card;
      });
    });
    
    // Remove from both canvasMolecules and customMolecules AFTER updating chip positions
    setCanvasMolecules(prev => prev.filter(mol => mol.id !== moleculeId));
    setCustomMolecules(prev => prev.filter(mol => mol.id !== moleculeId));
    
    toast({
      title: 'Molecule Removed',
      description: 'Molecule has been removed from the canvas'
    });
  };

  // Handle standalone card removal
  const handleStandaloneCardRemove = (standaloneCardId: string) => {
    const removedCard = standaloneCards.find(card => card.id === standaloneCardId);
    if (removedCard) {
      setStandaloneCards(prev => prev.filter(card => card.id !== standaloneCardId));
      toast({
        title: 'Standalone Atom Removed',
        description: `${removedCard.title || removedCard.atomId} has been removed from the workflow`
      });
    }
  };

  // Handle molecule addition (for fetched molecules)


  // Handle workflow rendering to Laboratory mode
  const handleRenderWorkflow = useCallback(async () => {
    // Check if all molecules have at least one atom
    const moleculesWithAtoms = canvasMolecules.filter(mol => mol.atoms && mol.atoms.length > 0);
    
    if (moleculesWithAtoms.length === 0) {
      toast({
        title: 'No Atoms Assigned',
        description: 'Please assign atoms to at least one molecule before rendering workflow',
        variant: 'destructive'
      });
      return;
    }

    if (moleculesWithAtoms.length !== canvasMolecules.length) {
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
      await saveWorkflowConfiguration();
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

      // Save merged cards to MongoDB atom_list_configuration
      console.log('💾 Saving merged Laboratory configuration to MongoDB...');
      const saveUrl = `${LABORATORY_PROJECT_STATE_API}/save`;
      const savePayload = {
        client_name: projectContext.client_name,
        app_name: projectContext.app_name,
        project_name: projectContext.project_name,
        cards: uniqueFinalCards,
        mode: 'laboratory',
      };

      const saveResponse = await fetch(saveUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(savePayload),
      });

      if (saveResponse.ok) {
        const saveResult = await saveResponse.json();
        console.log('✅ Laboratory configuration updated in MongoDB:', saveResult);
      } else {
        const errorText = await saveResponse.text();
        console.error('❌ Failed to save Laboratory configuration:', errorText);
        throw new Error(`Failed to save: ${saveResponse.status}`);
      }

      // Also keep localStorage workflow-data for backward compatibility
      const workflowData = {
        molecules: workflowMolecules,
        timestamp: new Date().toISOString(),
        type: 'workflow'
      };
      localStorage.setItem('workflow-data', JSON.stringify(workflowData));
      
      toast({
        title: 'Workflow Rendered',
        description: `Workflow has been updated in Laboratory mode. ${uniqueFinalCards.length} cards synchronized.`
      });

      // Navigate to Laboratory mode
      navigate('/laboratory');
    } catch (error) {
      console.error('❌ Error updating Laboratory configuration:', error);
      toast({
        title: 'Update Failed',
        description: 'Failed to update Laboratory configuration. Workflow may not be fully synchronized.',
        variant: 'destructive'
      });
    }
  }, [canvasMolecules, standaloneCards, toast, navigate]);

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

      const response = await fetch(`${MOLECULES_API}/workflow/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          workflow_name: workflowName,
          canvas_molecules: canvasMolecules,
          custom_molecules: customMolecules,
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

  // (Removed) Cross-sync from Workflow to Laboratory collection to avoid duplicate persistence

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
          console.log('📡 Found workflow data - canvas_molecules:', canvas_molecules?.length || 0, 'custom_molecules:', custom_molecules?.length || 0);
          
          // Update state with loaded data
          setWorkflowName(workflow_name || 'Untitled Workflow');
          setCanvasMolecules(canvas_molecules || []);
          setCustomMolecules(custom_molecules || []);
          setStandaloneCards(Array.isArray(standalone_cards) ? standalone_cards : []);
          
          if (showToast) {
            toast({
              title: "Workflow Loaded",
              description: `Workflow configuration has been loaded successfully`,
            });
          }
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
                console.log('📡 Found fallback workflow data - canvas_molecules:', canvas_molecules?.length || 0, 'custom_molecules:', custom_molecules?.length || 0);
                
                // Update state with loaded data
                setCanvasMolecules(canvas_molecules || []);
                setCustomMolecules(custom_molecules || []);
                setStandaloneCards(Array.isArray(standalone_cards) ? standalone_cards : []);
                
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

  // Function to clear workflow data
  const clearWorkflowData = () => {
    setCanvasMolecules([]);
    setCustomMolecules([]);
    setWorkflowName('Untitled Workflow');
    localStorage.removeItem('workflow-canvas-molecules');
    localStorage.removeItem('workflow-custom-molecules');
    localStorage.removeItem('workflow-name');
    toast({
      title: 'Workflow Cleared',
      description: 'All molecules have been removed from the canvas'
    });
  };

  // Create unique molecules list to avoid duplicates
  const allMolecules = [...canvasMolecules.map(m => ({ id: m.id, title: m.title }))];

  // Get all assigned atoms from molecules - this determines which atoms are hidden in the library
  const assignedAtoms = canvasMolecules.flatMap(molecule => molecule.atoms || []);

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
              <div>
            <h1 className="text-3xl font-semibold text-foreground mb-2">Workflow Mode</h1>
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

      {/* Pending deletions banner removed in Workflow Mode */}

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
          <ReactFlowProvider>
          <WorkflowCanvas
            onMoleculeSelect={handleMoleculeSelect}
            onCreateMolecule={handleCreateMolecule}
            canvasMolecules={canvasMolecules}
            standaloneChips={standaloneCards}
            onMoveAtomToMolecule={handleMoveAtomToMolecule}
            onMoveAtomToAtomList={handleMoveAtomToAtomList}
            onMoleculeRemove={handleMoleculeRemove}
            onMoleculeRename={handleRenameMolecule}
            onMoleculeAdd={handleMoleculeAdd}
            onMoleculeReplace={handleMoleculeReplace}
            onMoleculePositionsUpdate={handleMoleculePositionsUpdate}
            onStandaloneCardRemove={handleStandaloneCardRemove}
            isLibraryVisible={isLibraryVisible}
            isRightPanelVisible={isRightPanelVisible}
            isAtomLibraryVisible={isAtomLibraryVisible}
            isRightPanelToolVisible={isRightPanelToolVisible}
          />
          </ReactFlowProvider>
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
          />
        </div>

      </div>

    </div>
  );
};

export default WorkflowMode;