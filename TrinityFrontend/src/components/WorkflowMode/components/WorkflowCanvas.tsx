import React, { useCallback, useEffect, useRef, useState } from 'react';
import { safeStringify } from '@/utils/safeStringify';
import { Button } from '@/components/ui/button';
import ReactFlow, {
  Background,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Connection,
  Edge,
  EdgeChange,
  Node,
  NodeChange,
  useReactFlow,
  Controls,
  MiniMap
} from 'reactflow';
import 'reactflow/dist/style.css';
import MoleculeNode, { MoleculeNodeData } from './MoleculeNode';
import { Plus, Minus, ZoomIn, ZoomOut } from 'lucide-react';

interface WorkflowCanvasProps {
  onMoleculeSelect: (moleculeId: string) => void;
  onCreateMolecule?: () => void;
  onAtomAssign?: (atomId: string, moleculeId: string) => void;
  canvasMolecules?: any[];
  onMoveAtomToMolecule?: (atomId: string, fromMoleculeId: string, toMoleculeId: string) => void;
  onMoveAtomToAtomList?: (atomId: string, fromMoleculeId: string) => void;
  onMoleculeRemove?: (moleculeId: string) => void;
  onMoleculeRename?: (moleculeId: string, newName: string) => void;
  onMoleculeAdd?: (molecule: any) => void;
  isLibraryVisible?: boolean;
}

const nodeTypes = { molecule: MoleculeNode };

const STORAGE_KEY = 'workflow-canvas-molecules';

// Custom Zoom Controls Component
const ZoomControls: React.FC<{ zoomLevel: number }> = ({ zoomLevel }) => {
  const { zoomIn, zoomOut, zoomTo, fitView } = useReactFlow();

  return (
    <div className="absolute bottom-4 right-4 flex flex-col gap-2 z-50">
      <Button
        onClick={() => {
          zoomIn();
        }}
        size="sm"
        className="w-12 h-12 p-0 rounded-full shadow-xl bg-white hover:bg-gray-50 border-2 border-gray-300 hover:border-blue-400 transition-all"
        title="Zoom In"
      >
        <Plus className="w-5 h-5 text-gray-700" />
      </Button>
      <Button
        onClick={() => {
          zoomOut();
        }}
        size="sm"
        className="w-12 h-12 p-0 rounded-full shadow-xl bg-white hover:bg-gray-50 border-2 border-gray-300 hover:border-blue-400 transition-all"
        title="Zoom Out"
      >
        <Minus className="w-5 h-5 text-gray-700" />
      </Button>
      <Button
        onClick={() => {
          zoomTo(1);
        }}
        size="sm"
        className={`w-12 h-12 p-0 rounded-full shadow-xl transition-all text-xs font-bold ${
          Math.abs(zoomLevel - 1) < 0.1 
            ? 'bg-green-100 border-2 border-green-400 text-green-700' 
            : 'bg-white hover:bg-gray-50 border-2 border-gray-300 hover:border-blue-400'
        }`}
        title="Reset Zoom to 1:1"
      >
        {Math.abs(zoomLevel - 1) < 0.1 ? '✓' : '1:1'}
      </Button>
      <Button
        onClick={() => {
          fitView({ padding: 0.1, duration: 300 });
        }}
        size="sm"
        className="w-12 h-12 p-0 rounded-full shadow-xl bg-white hover:bg-gray-50 border-2 border-gray-300 hover:border-blue-400 transition-all"
        title="Fit View - Show all molecules"
      >
        <ZoomIn className="w-4 h-4 text-gray-700" />
      </Button>
    </div>
  );
};

const WorkflowCanvas: React.FC<WorkflowCanvasProps> = ({
  onMoleculeSelect,
  onCreateMolecule,
  canvasMolecules = [],
  onMoveAtomToMolecule,
  onMoveAtomToAtomList,
  onMoleculeRemove,
  onMoleculeRename,
  onMoleculeAdd,
  isLibraryVisible = true
}) => {
  const [nodes, setNodes] = useState<Node<MoleculeNodeData>[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const reactFlowWrapper = useRef<HTMLDivElement | null>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const [zoomLevel, setZoomLevel] = useState(1);

  // Initialize zoom level tracking when ReactFlow instance is ready
  useEffect(() => {
    if (reactFlowInstance) {
      // Get initial zoom level from ReactFlow instance
      const initialViewport = reactFlowInstance.getViewport();
      setZoomLevel(initialViewport.zoom);
    }
  }, [reactFlowInstance]);

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

  const onZoomChange = useCallback((zoom: number) => {
    setZoomLevel(zoom);
  }, []);

  // Save viewport state to localStorage when it changes
  const onViewportChange = useCallback((viewport: any) => {
    localStorage.setItem('workflow-viewport', JSON.stringify(viewport));
  }, []);

  // Load viewport state from localStorage on mount
  useEffect(() => {
    if (reactFlowInstance) {
      const savedViewport = localStorage.getItem('workflow-viewport');
      if (savedViewport) {
        try {
          const viewport = JSON.parse(savedViewport);
          // Restore saved viewport position and zoom
          reactFlowInstance.setViewport(viewport);
          setZoomLevel(viewport.zoom);
        } catch (error) {
          console.warn('Failed to restore viewport:', error);
        }
      }
    }
  }, [reactFlowInstance]);

  const removeNode = useCallback((id: string) => {
    setNodes(ns => ns.filter(n => n.id !== id));
    setEdges(es => es.filter(e => e.source !== id && e.target !== id));
    // Notify parent to remove from canvasMolecules
    if (onMoleculeRemove) {
      onMoleculeRemove(id);
    }
  }, [onMoleculeRemove]);

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

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    
    const moleculeData = event.dataTransfer.getData('application/json');
    if (!moleculeData) return;
    
    try {
      const molecule = JSON.parse(moleculeData);
      
      const newNodeId = `molecule-${Date.now()}`;
      
      // Calculate flexible position for new molecule
      const getFlexiblePosition = () => {
        const moleculesCount = nodes.length;
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
      
      const position = getFlexiblePosition();
      
      // Create a new molecule node with flexible positioning
      const newNode: Node<MoleculeNodeData> = {
        id: newNodeId,
        type: 'molecule',
        dragHandle: '.drag-handle',
        position,
        data: {
          id: newNodeId,
          type: molecule.type || '',
          title: molecule.title,
          subtitle: molecule.subtitle || '',
          tag: molecule.tag || '',
          atoms: molecule.atoms || [],
          selectedAtoms: {},
          atomOrder: molecule.atoms || [],
          onAtomToggle,
          onAtomReorder,
          onRemove: removeNode,
          onClick: onMoleculeSelect,
          onMoveAtomToMolecule,
          onMoveAtomToAtomList,
          onRename: onMoleculeRename,
          availableMolecules: canvasMolecules.map(m => ({ id: m.id, title: m.title }))
        }
      };
      
      // Find the last created molecule (most recent by ID timestamp)
      const getLastMolecule = () => {
        if (nodes.length === 0) return null;
        
        // Sort nodes by creation time (extracted from ID timestamp)
        const sortedNodes = [...nodes].sort((a, b) => {
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
        
        console.log('Sorted nodes by timestamp:', sortedNodes.map(n => ({ id: n.id, title: n.data.title })));
        return sortedNodes[0];
      };
      
      const lastMolecule = getLastMolecule();
      
      // Update nodes first
      setNodes(ns => [...ns, newNode]);
      
      // If there's a last molecule, create an edge connecting to it
      if (lastMolecule) {
        const newEdge: Edge = {
          id: `${lastMolecule.id}-${newNodeId}`,
          source: lastMolecule.id,
          target: newNodeId,
          sourceHandle: 'right',
          targetHandle: 'left',
          type: 'default',
          style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 },
          markerEnd: {
            type: 'arrowclosed',
            color: 'hsl(var(--primary))',
          },
        };
        
        setEdges(es => [...es, newEdge]);
        console.log(`✅ Auto-connected new molecule "${molecule.title}" to last molecule "${lastMolecule.data.title}" (${lastMolecule.id})`);
      } else {
        console.log(`ℹ️ No previous molecules found, "${molecule.title}" is the first molecule`);
      }
      
      // Notify parent component about the new molecule
      console.log('Dropped molecule:', molecule);
      
      // Add the molecule to parent state so it can be properly removed later
      if (onMoleculeAdd) {
        const canvasMolecule = {
          id: newNodeId,
          type: molecule.type || '',
          title: molecule.title,
          subtitle: molecule.subtitle || '',
          tag: molecule.tag || '',
          atoms: molecule.atoms || [],
          position: { x: position.x, y: position.y },
          connections: lastMolecule ? [lastMolecule.id] : [],
          selectedAtoms: {},
          atomOrder: molecule.atoms || []
        };
        onMoleculeAdd(canvasMolecule);
      }
      
    } catch (error) {
      console.error('Error parsing dropped molecule data:', error);
    }
  }, [reactFlowInstance, onAtomToggle, onAtomReorder, removeNode, onMoleculeSelect, onMoveAtomToMolecule, onMoveAtomToAtomList, canvasMolecules, nodes]);

  const handleCreateMoleculeClick = useCallback(() => {
    if (onCreateMolecule) {
      // Trigger the dialog to get the molecule name
      onCreateMolecule(); // This will trigger the dialog
    }
  }, [onCreateMolecule]);

  const onDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };

  // Removed localStorage loading - parent WorkflowMode now manages molecules

  // Trigger re-render when library visibility changes
  useEffect(() => {
    if (reactFlowInstance) {
      // Small delay to ensure DOM has updated
      setTimeout(() => {
        reactFlowInstance.fitView({ padding: 0.1 });
      }, 100);
    }
  }, [isLibraryVisible, reactFlowInstance]);

  // Update nodes when canvasMolecules change
  useEffect(() => {
    const newNodes: Node<MoleculeNodeData>[] = canvasMolecules.map((molecule, index) => {
      // Calculate position for simple grid layout
      const moleculeWidth = 48; // Keep same width
      const spacing = 192; // Keep same spacing
      const moleculesPerRow = 4; // 4 molecules per row
      const startX = 20;
      const startY = 20;
      
      const row = Math.floor(index / moleculesPerRow);
      const col = index % moleculesPerRow;
      
      // Simple grid positioning - always left-to-right, top-to-bottom
      const positionX = startX + (col * (moleculeWidth + spacing));
      const positionY = startY + (row * (moleculeWidth + spacing));

      return {
        id: molecule.id,
        type: 'molecule',
        dragHandle: '.drag-handle',
        position: { x: positionX, y: positionY },
        data: {
          id: molecule.id,
          type: molecule.type || '',
          title: molecule.title,
          subtitle: molecule.subtitle || '',
          tag: molecule.tag || '',
          atoms: molecule.atoms || [],
          selectedAtoms: molecule.selectedAtoms || {},
          atomOrder: molecule.atomOrder || [],
          onAtomToggle,
          onAtomReorder,
          onRemove: removeNode,
          onClick: onMoleculeSelect,
          onMoveAtomToMolecule,
          onMoveAtomToAtomList,
          onRename: onMoleculeRename,
          availableMolecules: canvasMolecules.map(m => ({ id: m.id, title: m.title }))
        }
      };
    });

    // Create edges following simple left-to-right flow
    const newEdges: Edge[] = [];
    const moleculesPerRow = 4; // Define moleculesPerRow for edge creation
    
    console.log('🔗 Creating edges for', newNodes.length, 'nodes');
    
    for (let i = 0; i < newNodes.length; i++) {
      const currentRow = Math.floor(i / moleculesPerRow);
      const currentCol = i % moleculesPerRow;
      
      console.log(`📍 Node ${i}: ${newNodes[i].data.title} (Row ${currentRow}, Col ${currentCol})`);
      
      // Always connect left-to-right within the same row
      if (currentCol < moleculesPerRow - 1) {
        // Not the last molecule in the row - connect to next molecule
        const nextIndex = i + 1;
        if (nextIndex < newNodes.length && Math.floor(nextIndex / moleculesPerRow) === currentRow) {
          console.log(`✅ Same row connection: ${newNodes[i].data.title} → ${newNodes[nextIndex].data.title}`);
          const edge = {
            id: `${newNodes[i].id}-${newNodes[nextIndex].id}`,
            source: newNodes[i].id,
            target: newNodes[nextIndex].id,
            sourceHandle: 'right',
            targetHandle: 'left',
            type: 'default',
            style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 },
            markerEnd: {
              type: 'arrowclosed',
              color: 'hsl(var(--primary))',
            },
          };
          console.log('🔗 Edge created:', edge);
          newEdges.push(edge);
        }
      } else {
        // Last molecule in row - connect to first molecule of next row
        const nextRowFirstIndex = (currentRow + 1) * moleculesPerRow;
        if (nextRowFirstIndex < newNodes.length) {
          console.log(`✅ Row transition: ${newNodes[i].data.title} → ${newNodes[nextRowFirstIndex].data.title}`);
          const edge = {
            id: `${newNodes[i].id}-${newNodes[nextRowFirstIndex].id}`,
            source: newNodes[i].id,
            target: newNodes[nextRowFirstIndex].id,
            sourceHandle: 'right',
            targetHandle: 'left',
            type: 'smoothstep',
            style: { stroke: 'hsl(var(--primary))', strokeWidth: 2, strokeDasharray: '5,5' },
            markerEnd: {
              type: 'arrowclosed',
              color: 'hsl(var(--primary))',
            },
          };
          console.log('🔗 Edge created:', edge);
          newEdges.push(edge);
        }
      }
    }
    
    console.log('🔗 Total edges created:', newEdges.length);
    console.log('🔗 All edges:', newEdges.map(e => `${e.source}(${e.sourceHandle}) → ${e.target}(${e.targetHandle})`));

    setNodes(newNodes);
    setEdges(newEdges);
  }, [canvasMolecules, onAtomToggle, onAtomReorder, removeNode, onMoleculeSelect]);


  // Removed the useEffect that was causing infinite loop
  // The parent WorkflowMode now manages molecules directly

  return (
    <div className="h-full w-full relative bg-gradient-to-br from-background via-card/50 to-muted/20 rounded-lg border-2 border-border/50 shadow-elegant backdrop-blur-sm">
      <div 
        ref={reactFlowWrapper} 
        className="w-full h-full overflow-auto scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-200"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: '#9ca3af #e5e7eb',
          height: '100%',
          width: '100%',
          minHeight: '100%'
        }}
      >
      {/* Plus Button for Creating Molecules */}
      {onCreateMolecule && (
        <Button
          className="absolute top-4 right-4 z-10 rounded-full w-10 h-10 p-0 shadow-lg"
          onClick={handleCreateMoleculeClick}
        >
          <span className="text-xl">+</span>
        </Button>
      )}
      
      {/* Decorative background pattern */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, hsl(var(--foreground)) 1px, transparent 0)`,
        backgroundSize: '40px 40px'
      }} />
      
      {/* Gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none" />
      
      
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
            onZoomChange={onZoomChange}
            onMove={onViewportChange}
            zoomOnScroll={false}
            zoomOnPinch={false}
            zoomOnDoubleClick={false}
            fitView={false}
            minZoom={0.1}
            maxZoom={4}
            defaultZoom={1}
            proOptions={{ hideAttribution: true }}
            style={{ 
              width: '100%', 
              height: '100%',
              minHeight: 'calc(100vh - 200px)',
              maxHeight: 'none'
            }}
          >
            <Background gap={24} color="hsl(var(--border) / 0.3)" className="opacity-50" />
            <ZoomControls zoomLevel={zoomLevel} />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
    </div>
  );
};

export default WorkflowCanvas;