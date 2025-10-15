import React, { useCallback, useEffect, useRef, useState } from 'react';
import { safeStringify } from '@/utils/safeStringify';
import { useToast } from '@/hooks/use-toast';
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
  canEdit: boolean;
}

const nodeTypes = { molecule: MoleculeNode };

const STORAGE_KEY = 'workflow-canvas-molecules';

const WorkflowCanvas: React.FC<WorkflowCanvasProps> = ({
  onMoleculeSelect,
  onCanvasMoleculesUpdate,
  canEdit
}) => {
  const [nodes, setNodes] = useState<Node<MoleculeNodeData>[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const reactFlowWrapper = useRef<HTMLDivElement | null>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const { toast } = useToast();

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

  const onNodeResize = useCallback((id: string, width: number, height: number) => {
    setNodes(ns =>
      ns.map(node => 
        node.id === id 
          ? { 
              ...node, 
              data: { 
                ...node.data, 
                width, 
                height 
              } 
            } 
          : node
      )
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
          onClick: onMoleculeSelect,
          onResize: onNodeResize
        }
      };
      setNodes(ns => ns.concat(newNode));
    },
    [reactFlowInstance, onMoleculeSelect, onAtomToggle, onAtomReorder, removeNode, onNodeResize]
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
            onClick: onMoleculeSelect,
            onResize: onNodeResize,
            width: m.width,
            height: m.height
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
        console.log('Successfully Loaded Existing Project State');
        toast({ title: 'Successfully Loaded Existing Project State' });
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      atomOrder: n.data.atomOrder,
      width: n.data.width,
      height: n.data.height
    }));
    onCanvasMoleculesUpdate(molecules);
    localStorage.setItem(STORAGE_KEY, safeStringify(molecules));
  }, [nodes, edges]); // eslint-disable-line react-hooks/exhaustive-deps -- omit onCanvasMoleculesUpdate from deps

  return (
    <div ref={reactFlowWrapper} className="h-full relative bg-gradient-to-br from-slate-50 via-background to-blue-50/30 rounded-2xl border-2 border-border/50 overflow-hidden shadow-2xl backdrop-blur-sm">
      {/* Animated Background Pattern */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5"></div>
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,rgba(59,130,246,0.1),transparent_50%)]"></div>
      </div>
      
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={canEdit ? onNodesChange : undefined}
          onEdgesChange={canEdit ? onEdgesChange : undefined}
          onConnect={canEdit ? onConnect : undefined}
          nodeTypes={nodeTypes}
          onInit={setReactFlowInstance}
          onDrop={canEdit ? onDrop : undefined}
          onDragOver={canEdit ? onDragOver : undefined}
          nodesDraggable={canEdit}
          nodesConnectable={canEdit}
          elementsSelectable={canEdit}
          fitView
          proOptions={{ hideAttribution: true }}
          defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
          minZoom={0.1}
          maxZoom={3}
          zoomOnScroll={true}
          zoomOnPinch={true}
          zoomOnDoubleClick={true}
          panOnDrag={true}
          panOnScroll={false}
          defaultEdgeOptions={{
            type: 'smoothstep',
            animated: true,
            style: { 
              stroke: 'hsl(var(--primary))', 
              strokeWidth: 3,
              strokeDasharray: '0',
              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))'
            },
            markerEnd: {
              type: 'arrowclosed',
              color: 'hsl(var(--primary))',
              width: 24,
              height: 24
            }
          }}
        >
          <Background 
            gap={32} 
            size={1.5}
            color="hsl(var(--primary))" 
            variant="dots"
            className="opacity-20"
          />
          <Controls 
            className="!bg-white/90 !backdrop-blur-md !border-2 !border-white/20 !rounded-2xl !shadow-xl !p-2"
            showZoom={true}
            showFitView={true}
            showInteractive={false}
            position="top-right"
          />
        </ReactFlow>
      </ReactFlowProvider>
      
      {/* Floating Action Hints - Positioned at top */}
      {nodes.length === 0 && canEdit && (
        <div className="absolute top-6 left-1/2 transform -translate-x-1/2 pointer-events-none">
          <div className="text-center space-y-3 p-4 bg-white/80 backdrop-blur-sm rounded-xl shadow-lg border border-white/20 floating-hint">
            {/* Icon at the top */}
            <div className="w-8 h-8 mx-auto bg-gradient-to-br from-primary to-primary/60 rounded-lg flex items-center justify-center shadow-md">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            
            {/* Text content below the icon */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-800">Start Building Your Workflow</h3>
              <div className="text-xs text-gray-600 max-w-xs space-y-1">
                <p>Drag molecules from the sidebar to create your workflow.</p>
                <p>Connect them to build your data pipeline.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkflowCanvas;