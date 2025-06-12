import React, { useCallback, useEffect, useRef, useState } from 'react';
import { safeStringify } from '@/utils/safeStringify';
import ReactFlow, {
  Background,
  Controls,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Connection,
  Edge,
  EdgeChange,
  Node,
  NodeChange,
  useReactFlow
} from 'reactflow';
import 'reactflow/dist/style.css';
import MoleculeNode, { MoleculeNodeData } from './MoleculeNode';
import { REGISTRY_API } from '@/lib/api';

interface WorkflowCanvasProps {
  onMoleculeSelect: (moleculeId: string) => void;
  onCanvasMoleculesUpdate?: (molecules: any[]) => void;
}

const nodeTypes = { molecule: MoleculeNode };

const STORAGE_KEY = 'workflow-canvas-molecules';

const WorkflowCanvas: React.FC<WorkflowCanvasProps> = ({
  onMoleculeSelect,
  onCanvasMoleculesUpdate
}) => {
  const [nodes, setNodes] = useState<Node<MoleculeNodeData>[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const reactFlowWrapper = useRef<HTMLDivElement | null>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes(ns => applyNodeChanges(changes, ns)),
    []
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges(es => applyEdgeChanges(changes, es)),
    []
  );
  const onConnect = useCallback(
    (connection: Connection) => setEdges(es => addEdge(connection, es)),
    []
  );

  const removeNode = useCallback((id: string) => {
    setNodes(ns => ns.filter(n => n.id !== id));
    setEdges(es => es.filter(e => e.source !== id && e.target !== id));
  }, []);

  const onAtomToggle = useCallback((id: string, atom: string, checked: boolean) => {
    setNodes(ns =>
      ns.map(node =>
        node.id === id
          ? {
              ...node,
              data: {
                ...node.data,
                selectedAtoms: { ...node.data.selectedAtoms, [atom]: checked }
              }
            }
          : node
      )
    );
  }, []);

  const onAtomReorder = useCallback((id: string, order: string[]) => {
    setNodes(ns =>
      ns.map(node => (node.id === id ? { ...node, data: { ...node.data, atomOrder: order } } : node))
    );
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      if (!reactFlowWrapper.current || !reactFlowInstance) return;
      const data = event.dataTransfer.getData('application/json');
      if (!data) return;
      const moleculeData = JSON.parse(data);
      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = reactFlowInstance.project({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top
      });

      const selectedAtoms: Record<string, boolean> = {};
      moleculeData.atoms.forEach((atom: string) => {
        selectedAtoms[atom] = false;
      });

      const nodeId = `${moleculeData.id}-${Date.now()}`;

      const newNode: Node<MoleculeNodeData> = {
        id: nodeId,
        type: 'molecule',
        dragHandle: '.drag-handle',
        position,
        data: {
          id: nodeId,
          type: moleculeData.type,
          title: moleculeData.title,
          subtitle: moleculeData.subtitle,
          tag: moleculeData.tag,
          atoms: moleculeData.atoms,
          selectedAtoms,
          atomOrder: [...moleculeData.atoms],
          onAtomToggle,
          onAtomReorder,
          onRemove: removeNode,
          onClick: onMoleculeSelect
        }
      };
      setNodes(ns => ns.concat(newNode));
    },
    [reactFlowInstance, onMoleculeSelect, onAtomToggle, onAtomReorder, removeNode]
  );

  const onDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };

  // Load saved workflow on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const loadFromLayout = (molecules: any[]) => {
      try {
        const loadedNodes: Node<MoleculeNodeData>[] = molecules.map((m: any) => ({
          id: m.id,
          type: 'molecule',
          dragHandle: '.drag-handle',
          position: m.position,
          data: {
            id: m.id,
            type: m.type,
            title: m.title,
            subtitle: m.subtitle,
            tag: m.tag,
            atoms: m.atoms,
            selectedAtoms: m.selectedAtoms,
            atomOrder: m.atomOrder,
            onAtomToggle,
            onAtomReorder,
            onRemove: removeNode,
            onClick: onMoleculeSelect
          }
        }));

        const loadedEdges: Edge[] = [];
        molecules.forEach((m: any) => {
          (m.connections || []).forEach((c: any, idx: number) => {
            loadedEdges.push({
              id: `${m.id}-${c.target}-${idx}`,
              source: m.id,
              target: c.target
            });
          });
        });

        setNodes(loadedNodes);
        setEdges(loadedEdges);
      } catch (e) {
        console.error('Failed to parse workflow layout', e);
      }
    };

    if (stored) {
      try {
        loadFromLayout(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to load workflow from storage', e);
      }
    } else {
      const current = localStorage.getItem('current-project');
      if (current) {
        fetch(`${REGISTRY_API}/projects/${JSON.parse(current).id}/`, {
          credentials: 'include'
        })
          .then(res => (res.ok ? res.json() : null))
          .then(data => {
            if (data && data.state && data.state.workflow_canvas) {
              const layout = data.state.workflow_canvas;
              localStorage.setItem(STORAGE_KEY, safeStringify(layout));
              loadFromLayout(layout);
            }
          })
          .catch(() => {});
      }
    }
  }, []);

  useEffect(() => {
    if (!onCanvasMoleculesUpdate) return;
    const molecules = nodes.map(n => ({
      id: n.id,
      type: n.data.type,
      title: n.data.title,
      subtitle: n.data.subtitle,
      tag: n.data.tag,
      atoms: n.data.atoms,
      position: n.position,
      connections: edges.filter(e => e.source === n.id).map(e => ({ target: e.target })),
      selectedAtoms: n.data.selectedAtoms,
      atomOrder: n.data.atomOrder
    }));
    onCanvasMoleculesUpdate(molecules);
    localStorage.setItem(STORAGE_KEY, safeStringify(molecules));
  }, [nodes, edges]); // eslint-disable-line react-hooks/exhaustive-deps -- omit onCanvasMoleculesUpdate from deps

  return (
    <div ref={reactFlowWrapper} className="h-full bg-white rounded-lg border border-gray-200 overflow-hidden">
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          onInit={setReactFlowInstance}
          onDrop={onDrop}
          onDragOver={onDragOver}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} color="rgba(0,0,0,0.05)" />
          <Controls />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
};

export default WorkflowCanvas;
