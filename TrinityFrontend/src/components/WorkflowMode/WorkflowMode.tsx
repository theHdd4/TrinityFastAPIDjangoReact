
import React, { useState, useCallback, useEffect } from 'react';
import { safeStringify } from '@/utils/safeStringify';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Play } from 'lucide-react';
import Header from '@/components/Header';
import WorkflowCanvas from './components/WorkflowCanvas';
import MoleculeList from '@/components/MoleculeList/MoleculeList';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

interface SelectedAtom {
  atomName: string;
  moleculeId: string;
  moleculeTitle: string;
  order: number;
}

const WorkflowMode = () => {
  const [selectedMoleculeId, setSelectedMoleculeId] = useState<string>();
  const [canvasMolecules, setCanvasMolecules] = useState<any[]>([]);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('workflow:edit');

  useEffect(() => {
    if (localStorage.getItem('workflow-canvas-molecules')) {
      console.log('Successfully Loaded Existing Project State');
      toast({ title: 'Successfully Loaded Existing Project State' });
    }
  }, []); 

  useEffect(() => {
    const envStr = localStorage.getItem('env');
    if (envStr) {
      try {
        const env = JSON.parse(envStr);
        console.log('Environment in app', env);
      } catch {
        /* ignore */
      }
    }
  }, []);


  const handleMoleculeSelect = (moleculeId: string) => {
    if (!canEdit) return;
    setSelectedMoleculeId(moleculeId);
  };

  const handleCanvasMoleculesUpdate = useCallback(
    (molecules: any[]) => {
      if (!canEdit) return;
      setCanvasMolecules(molecules);

      // Save to localStorage for session persistence
      localStorage.setItem('workflow-canvas-molecules', safeStringify(molecules));
    },
    [canEdit]
  );

  const renderWorkflow = async () => {
    if (!canEdit) return;
    console.log('Rendering workflow with molecules:', canvasMolecules);

    // Check if we have at least one molecule with selected atoms
    const moleculesWithSelectedAtoms = canvasMolecules.filter((molecule) => {
      const hasSelectedAtoms = molecule.selectedAtoms && 
        Object.values(molecule.selectedAtoms).some(selected => selected === true);
      return hasSelectedAtoms;
    });

    if (moleculesWithSelectedAtoms.length === 0) {
      toast({
        title: 'No atoms selected',
        description: 'Select at least one atom from the molecules before rendering the workflow.',
        variant: 'destructive'
      });
      return;
    }

    // Check for completely isolated molecules (not connected to anything)
    const isolatedMolecules = canvasMolecules.filter((molecule) => {
      const hasOutgoing = molecule.connections && molecule.connections.length > 0;
      const hasIncoming = canvasMolecules.some((m) =>
        m.connections?.some((c: { target: string }) => c.target === molecule.id)
      );
      return !hasOutgoing && !hasIncoming;
    });

    // Allow isolated molecules if they have selected atoms (they can be standalone)
    const problematicIsolated = isolatedMolecules.filter((molecule) => {
      const hasSelectedAtoms = molecule.selectedAtoms && 
        Object.values(molecule.selectedAtoms).some(selected => selected === true);
      return !hasSelectedAtoms;
    });

    if (problematicIsolated.length > 0) {
      toast({
        title: 'Unconnected molecules',
        description: 'Either connect all molecules or ensure they have selected atoms.',
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

    // Handle isolated molecules (no connections) - they can be processed independently
    const connectedMoleculeIds = new Set(orderedIds);
    const isolatedMoleculeIds = canvasMolecules
      .filter(m => !connectedMoleculeIds.has(m.id))
      .map(m => m.id);
    
    // Combine ordered connected molecules with isolated molecules
    const finalOrderedIds = [...orderedIds, ...isolatedMoleculeIds];
    
    if (connectedMoleculeIds.size !== orderedIds.length) {
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

    const orderedMolecules = finalOrderedIds.map(id => idToMolecule[id]);

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
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      
      {/* Workflow Header */}
      <div className="bg-card border-b border-border px-8 py-6 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-semibold text-foreground mb-2">Workflow Mode</h2>
            <p className="text-muted-foreground">
              Drag molecules from the list onto the workflow canvas. Connect molecules by drawing arrows between them.
            </p>
          </div>
          
          <div className="flex items-center space-x-4">
            <Button
              className={`bg-primary text-primary-foreground px-6 ${
                canEdit ? 'hover:bg-primary/90' : 'opacity-50 cursor-not-allowed'
              }`}
              onClick={canEdit ? renderWorkflow : undefined}
              disabled={!canEdit}
            >
              <Play className="w-4 h-4 mr-2" />
              Render Workflow
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex">
        {/* Molecule List */}
        <div className={`w-80 bg-card border-r border-border ${canEdit ? '' : 'cursor-not-allowed'}`}>
          <MoleculeList canEdit={canEdit} />
        </div>

        {/* Workflow Canvas */}
        <div className={`flex-1 p-8 ${canEdit ? '' : 'cursor-not-allowed'}`}>
          <WorkflowCanvas
            onMoleculeSelect={handleMoleculeSelect}
            onCanvasMoleculesUpdate={handleCanvasMoleculesUpdate}
            canEdit={canEdit}
          />
        </div>
      </div>
    </div>
  );
};

export default WorkflowMode;