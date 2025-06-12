
import React, { useState, useCallback } from 'react';
import { safeStringify } from '@/utils/safeStringify';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Play, Save, Share2 } from 'lucide-react';
import Header from '@/components/Header';
import WorkflowCanvas from './components/WorkflowCanvas';
import MoleculeList from '@/components/MoleculeList/MoleculeList';
import { useToast } from '@/hooks/use-toast';
import { REGISTRY_API } from '@/lib/api';

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

  const handleMoleculeSelect = (moleculeId: string) => {
    setSelectedMoleculeId(moleculeId);
  };

  const handleCanvasMoleculesUpdate = useCallback((molecules: any[]) => {
    setCanvasMolecules(molecules);
  }, []);

  const renderWorkflow = async () => {
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

    const current = localStorage.getItem('current-project');
    if (current) {
      try {
        const proj = JSON.parse(current);
        await fetch(`${REGISTRY_API}/projects/${proj.id}/`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            state: { workflow_selected_atoms: selectedAtoms },
          }),
        });
      } catch {
        /* ignore */
      }
    }

    toast({
      title: 'Workflow Rendered',
      description: `Successfully rendered ${selectedAtoms.length} atoms to Laboratory mode.`
    });

    console.log('Selected atoms for rendering:', selectedAtoms);

    navigate('/laboratory');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />
      
      {/* Workflow Header */}
      <div className="bg-white border-b border-gray-200 px-8 py-6 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-light text-gray-900 mb-2">Workflow Mode</h2>
            <p className="text-gray-600 font-light">
              Drag molecules from the list onto the workflow canvas. Connect molecules by drawing arrows between them.
            </p>
          </div>
          
          <div className="flex items-center space-x-4">
            <Button variant="outline" size="sm" className="font-light border-gray-300 hover:border-gray-400">
              <Save className="w-4 h-4 mr-2" />
              Save
            </Button>
            <Button variant="outline" size="sm" className="font-light border-gray-300 hover:border-gray-400">
              <Share2 className="w-4 h-4 mr-2" />
              Share
            </Button>
            <Button 
              className="bg-gray-900 hover:bg-gray-800 text-white font-light px-6"
              onClick={renderWorkflow}
            >
              <Play className="w-4 h-4 mr-2" />
              Render Workflow
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex">
        {/* Workflow Canvas */}
        <div className="flex-1 p-8">
          <WorkflowCanvas 
            onMoleculeSelect={handleMoleculeSelect}
            onCanvasMoleculesUpdate={handleCanvasMoleculesUpdate}
          />
        </div>

        {/* Molecule List */}
        <div className="w-80 bg-white border-l border-gray-200">
          <MoleculeList />
        </div>
      </div>
    </div>
  );
};

export default WorkflowMode;
