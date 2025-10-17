
import React, { useState, useCallback, useEffect } from 'react';
import { safeStringify } from '@/utils/safeStringify';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Play, Save, Share2, Upload } from 'lucide-react';
import Header from '@/components/Header';
import WorkflowCanvas from './components/WorkflowCanvas';
import MoleculeList from '@/components/MoleculeList/MoleculeList';
import WorkflowRightPanel from './components/WorkflowRightPanel';
import CreateMoleculeDialog from './components/CreateMoleculeDialog';
import { useToast } from '@/hooks/use-toast';
import { MOLECULES_API } from '@/lib/api';
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
  const { toast } = useToast();
  const navigate = useNavigate();

  // Load workflow state from localStorage on component mount
  useEffect(() => {
    const savedCanvasMolecules = localStorage.getItem('workflow-canvas-molecules');
    const savedCustomMolecules = localStorage.getItem('workflow-custom-molecules');
    
    if (savedCanvasMolecules) {
      try {
        const parsed = JSON.parse(savedCanvasMolecules);
        setCanvasMolecules(parsed);
      } catch (error) {
        console.error('Error loading canvas molecules:', error);
      }
    }
    
    if (savedCustomMolecules) {
      try {
        const parsed = JSON.parse(savedCustomMolecules);
        setCustomMolecules(parsed);
      } catch (error) {
        console.error('Error loading custom molecules:', error);
      }
    }

  }, []);

  // Try to load saved workflow configuration from server on mount if no localStorage data
  useEffect(() => {
    const savedCanvasMolecules = localStorage.getItem('workflow-canvas-molecules');
    const savedCustomMolecules = localStorage.getItem('workflow-custom-molecules');
    
    // Only try to load from server if no local data exists
    if (!savedCanvasMolecules && !savedCustomMolecules) {
      loadWorkflowConfiguration();
    }
  }, []);

  // Save workflow state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('workflow-canvas-molecules', JSON.stringify(canvasMolecules));
  }, [canvasMolecules]);

  useEffect(() => {
    localStorage.setItem('workflow-custom-molecules', JSON.stringify(customMolecules));
  }, [customMolecules]);

  const handleMoleculeSelect = (moleculeId: string) => {
    setSelectedMoleculeId(moleculeId);
  };

  const handleCanvasMoleculesUpdate = useCallback((molecules: any[]) => {
      setCanvasMolecules(molecules);
  }, []);

  const handleCreateMolecule = () => {
    // Generate numbered name automatically
    const existingNewMolecules = canvasMolecules.filter(m => 
      m.title === 'New Molecule' || m.title.startsWith('New Molecule ')
    );
    const nextNumber = existingNewMolecules.length + 1;
    const finalName = `New Molecule ${nextNumber}`;

    const newMolecule = {
      id: `custom-molecule-${Date.now()}`,
      title: finalName,
      atoms: []
    };
    setCustomMolecules(prev => [...prev, newMolecule]);
    
    // Find the last created molecule for auto-connection
    const getLastMolecule = () => {
      if (canvasMolecules.length === 0) return null;
      
      // Sort molecules by creation time (extracted from ID timestamp)
      const sortedMolecules = [...canvasMolecules].sort((a, b) => {
        // Extract timestamp from different ID formats
        const getTimestamp = (id: string) => {
          if (id.startsWith('molecule-')) {
            return parseInt(id.split('-')[1]) || 0;
          } else if (id.startsWith('custom-molecule-')) {
            return parseInt(id.split('-')[2]) || 0;
          }
          return 0;
        };
        
        const aTime = getTimestamp(a.id);
        const bTime = getTimestamp(b.id);
        return bTime - aTime; // Most recent first
      });
      
      console.log('Sorted canvas molecules by timestamp:', sortedMolecules.map(m => ({ id: m.id, title: m.title })));
      return sortedMolecules[0];
    };
    
    const lastMolecule = getLastMolecule();
    
    // Calculate flexible position for new molecule
    const getFlexiblePosition = () => {
      const moleculesCount = canvasMolecules.length;
      const moleculesPerRow = 3; // Maximum molecules per row
      const moleculeWidth = 280; // Width of each molecule card
      const moleculeHeight = 200; // Height of each molecule card
      const padding = 50; // Padding around molecules
      
      const row = Math.floor(moleculesCount / moleculesPerRow);
      const col = moleculesCount % moleculesPerRow;
      
      return {
        x: padding + (col * (moleculeWidth + 30)), // 30px spacing between molecules
        y: padding + (row * (moleculeHeight + 30)) // 30px spacing between rows
      };
    };
    
    // Add molecule to canvas with flexible positioning
    const canvasMolecule = {
      id: newMolecule.id,
      type: '',
      title: finalName,
      subtitle: '',
      tag: '',
      atoms: [],
      position: getFlexiblePosition(),
      connections: lastMolecule ? [lastMolecule.id] : [], // Auto-connect to last molecule
      selectedAtoms: {},
      atomOrder: []
    };
    setCanvasMolecules(prev => [...prev, canvasMolecule]);
    
    if (lastMolecule) {
      console.log(`✅ Auto-connected new molecule "${finalName}" to last molecule "${lastMolecule.title}" (${lastMolecule.id})`);
    } else {
      console.log(`ℹ️ No previous molecules found, "${finalName}" is the first molecule`);
    }
    
    toast({
      title: 'Molecule Created',
      description: `"${finalName}" has been created and added to the canvas${lastMolecule ? ` and connected to "${lastMolecule.title}"` : ''}.`
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

  // Handle molecule removal
  const handleMoleculeRemove = (moleculeId: string) => {
    // Remove from both canvasMolecules and customMolecules
    setCanvasMolecules(prev => prev.filter(mol => mol.id !== moleculeId));
    setCustomMolecules(prev => prev.filter(mol => mol.id !== moleculeId));
    toast({
      title: 'Molecule Removed',
      description: 'Molecule has been removed from the canvas'
    });
  };

  // Handle molecule addition (for fetched molecules)
  const handleMoleculeAdd = (molecule: any) => {
    setCanvasMolecules(prev => [...prev, molecule]);
    console.log('Added fetched molecule to canvasMolecules:', molecule.title);
  };

  // Handle workflow rendering to Laboratory mode
  const handleRenderWorkflow = useCallback(() => {
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

    // Function to convert atom names to atom IDs for Laboratory mode
    const convertAtomNameToId = (atomName: string) => {
      return atomName
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
    };

    // Prepare workflow data for Laboratory mode
    const workflowData = {
      molecules: moleculesWithAtoms.map(mol => ({
        id: mol.id,
        title: mol.title,
        atoms: mol.atoms.map(atomName => convertAtomNameToId(atomName)), // Convert names to IDs
        atomOrder: (mol.atomOrder || mol.atoms).map(atomName => convertAtomNameToId(atomName)) // Convert names to IDs
      })),
      timestamp: new Date().toISOString(),
      type: 'workflow'
    };

    console.log('Workflow data for Laboratory mode:', workflowData);

    // Save workflow data to localStorage for Laboratory mode
    localStorage.setItem('workflow-data', JSON.stringify(workflowData));
    
    toast({
      title: 'Workflow Rendered',
      description: 'Workflow has been prepared for Laboratory mode'
    });

    // Navigate to Laboratory mode
    navigate('/laboratory');
  }, [canvasMolecules, toast, navigate]);

  // Function to save workflow configuration
  const saveWorkflowConfiguration = async () => {
    try {
      // Get current app/project information from localStorage
      const currentAppStr = localStorage.getItem('current-app');
      const currentProjectStr = localStorage.getItem('current-project');
      
      let client_id = '';
      let app_id = '';
      let project_id = null;
      
      if (currentAppStr) {
        try {
          const currentApp = JSON.parse(currentAppStr);
          client_id = currentApp.client_name || '';
          app_id = currentApp.app_name || '';
        } catch (e) {
          console.warn('Failed to parse current app:', e);
        }
      }
      
      if (currentProjectStr) {
        try {
          const currentProject = JSON.parse(currentProjectStr);
          project_id = currentProject.id || null;
        } catch (e) {
          console.warn('Failed to parse current project:', e);
        }
      }

      const response = await fetch(`${MOLECULES_API}/workflow/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          canvas_molecules: canvasMolecules,
          custom_molecules: customMolecules,
          user_id: '', // Could be enhanced with actual user ID from session
          client_id: client_id,
          app_id: app_id,
          project_id: project_id
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
  const loadWorkflowConfiguration = async () => {
    try {
      // Get current app/project information from localStorage
      const currentAppStr = localStorage.getItem('current-app');
      const currentProjectStr = localStorage.getItem('current-project');
      
      let client_id = '';
      let app_id = '';
      let project_id = null;
      
      if (currentAppStr) {
        try {
          const currentApp = JSON.parse(currentAppStr);
          client_id = currentApp.client_name || '';
          app_id = currentApp.app_name || '';
        } catch (e) {
          console.warn('Failed to parse current app:', e);
        }
      }
      
      if (currentProjectStr) {
        try {
          const currentProject = JSON.parse(currentProjectStr);
          project_id = currentProject.id || null;
        } catch (e) {
          console.warn('Failed to parse current project:', e);
        }
      }

      const response = await fetch(`${MOLECULES_API}/workflow/get`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          user_id: '', // Could be enhanced with actual user ID from session
          client_id: client_id,
          app_id: app_id,
          project_id: project_id
        })
      });

      if (response.ok) {
        const result = await response.json();
        
        if (result.workflow_data) {
          const { canvas_molecules, custom_molecules } = result.workflow_data;
          
          // Update state with loaded data
          setCanvasMolecules(canvas_molecules || []);
          setCustomMolecules(custom_molecules || []);
          
          toast({
            title: "Workflow Loaded",
            description: `Workflow configuration has been loaded successfully`,
          });
          console.log('Workflow loaded:', result.workflow_data);
        } else {
          toast({
            title: "No Saved Workflow",
            description: "No saved workflow configuration found for this project",
            variant: "destructive",
          });
        }
      } else {
        throw new Error('Failed to load workflow');
      }
    } catch (error) {
      console.error('Error loading workflow:', error);
      toast({
        title: "Load Failed",
        description: "Failed to load workflow configuration. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Function to clear workflow data
  const clearWorkflowData = () => {
    setCanvasMolecules([]);
    setCustomMolecules([]);
    localStorage.removeItem('workflow-canvas-molecules');
    localStorage.removeItem('workflow-custom-molecules');
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
      <Header />
      
      {/* Workflow Header */}
      <div className="bg-card px-8 py-6 flex-shrink-0">
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
            <Button variant="outline" size="sm" onClick={loadWorkflowConfiguration}>
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

      <div className="flex-1 flex overflow-hidden">
        {/* Molecule Library - LEFT SIDE */}
        <div className="w-80 bg-card border-r border-border flex flex-col">
          <MoleculeList canEdit={true} />
        </div>

        {/* Workflow Canvas - MAIN AREA */}
        <div className="flex-1 p-6 relative">
            <WorkflowCanvas
              onMoleculeSelect={handleMoleculeSelect}
            onCreateMolecule={handleCreateMolecule}
            canvasMolecules={canvasMolecules}
            onMoveAtomToMolecule={handleMoveAtomToMolecule}
            onMoveAtomToAtomList={handleMoveAtomToAtomList}
            onMoleculeRemove={handleMoleculeRemove}
            onMoleculeRename={handleRenameMolecule}
            onMoleculeAdd={handleMoleculeAdd}
          />
        </div>

        {/* Right Side Panel with Icons */}
        <div className="h-full">
          <WorkflowRightPanel 
            molecules={allMolecules}
            onAtomAssignToMolecule={handleAtomAssignToMolecule}
            onMultipleAtomsAssignToMolecule={handleMultipleAtomsAssignToMolecule}
            assignedAtoms={assignedAtoms}
          />
        </div>
      </div>

    </div>
  );
};

export default WorkflowMode;