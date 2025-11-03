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
  MiniMap,
  Handle,
  Position
} from 'reactflow';
import 'reactflow/dist/style.css';
import MoleculeNode, { MoleculeNodeData } from './MoleculeNode';
import { Plus, Minus, ZoomIn, ZoomOut, Grid3X3, PlusCircle } from 'lucide-react';
import { atomIconMap } from '../utils/atomIconMap';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

interface WorkflowCanvasProps {
  onMoleculeSelect: (moleculeId: string) => void;
  onCreateMolecule?: () => void;
  onAtomAssign?: (atomId: string, moleculeId: string) => void;
  canvasMolecules?: any[];
  standaloneChips?: Array<{ 
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
  }>;
  onMoveAtomToMolecule?: (atomId: string, fromMoleculeId: string, toMoleculeId: string) => void;
  onMoveAtomToAtomList?: (atomId: string, fromMoleculeId: string) => void;
  onMoleculeRemove?: (moleculeId: string) => void;
  onMoleculeRename?: (moleculeId: string, newName: string) => void;
  onMoleculeAdd?: (molecule: any) => void;
  onMoleculeReplace?: (oldId: string, newMolecule: any) => void; // NEW: Replace molecule in parent state
  onMoleculePositionsUpdate?: (positions: { moleculeId: string; position: { x: number; y: number } }[]) => void; // NEW: Update molecule positions
  onStandaloneCardRemove?: (standaloneCardId: string) => void;
  isLibraryVisible?: boolean;
  isRightPanelVisible?: boolean;
  isAtomLibraryVisible?: boolean;
  isRightPanelToolVisible?: boolean;
}

type StandaloneChipData = {
  id: string;
  title: string;
  atomId: string;
  onRemove?: (id: string) => void;
};

// Get category color based on atom categories (same as MoleculeNode)
const getCategoryColor = (atomName: string) => {
  const atomCategoryMap: Record<string, string> = {
    // Data Sources - Blue
    'data-upload-validate': 'blue', 'csv-import': 'blue', 'json-import': 'blue', 'database-connect': 'blue',
    // Data Processing - Green
    'feature-overview': 'green', 'groupby-weighted-average': 'green', 'merge': 'green', 'concat': 'green',
    'scope-selector': 'green', 'row-operations': 'green', 'column-classifier': 'green', 'create-column': 'green',
    'dataframe-operations': 'green', 'groupby-wtg-avg': 'green',
    // Analytics - Purple
    'explore': 'purple', 'correlation': 'purple', 'descriptive-stats': 'purple', 'trend-analysis': 'purple',
    // Machine Learning - Orange
    'auto-regressive-models': 'orange', 'clustering': 'orange', 'scenario-planner': 'orange',
    'build-model-feature-based': 'orange', 'regression-feature-based': 'orange',
    'select-models-feature': 'orange', 'evaluate-models-feature': 'orange',
    'select-models-auto-regressive': 'orange', 'evaluate-models-auto-regressive': 'orange',
    // Visualization - Pink
    'chart-maker': 'pink', 'text-box': 'pink', 'scatter-plot': 'pink', 'histogram': 'pink',
    // Planning & Optimization - Indigo
    'optimizer': 'indigo',
    // Utilities - Gray
    'atom-maker': 'gray', 'read-presentation-summarize': 'gray',
    // Business Intelligence - Emerald
    'base-price-estimator': 'emerald', 'promo-estimator': 'emerald',
  };
  
  const exactMatch = atomCategoryMap[atomName];
  if (exactMatch) return exactMatch;
  
  const normalizedName = atomName.toLowerCase().replace(/\s+/g, '-');
  const normalizedMatch = atomCategoryMap[normalizedName];
  if (normalizedMatch) return normalizedMatch;
  
  return 'blue';
};

const StandaloneChipNode: React.FC<{ data: StandaloneChipData } & any> = ({ data }) => {
  const AtomIcon = atomIconMap[data.atomId] || Plus;
  
  // Get category color for border
  const categoryColor = getCategoryColor(data.atomId);
  
  // Determine border color based on category (using 400 shades like molecule atoms)
  const getBorderColor = (color: string) => {
    switch (color) {
      case 'blue': return 'border-blue-400 hover:border-blue-500';
      case 'green': return 'border-green-400 hover:border-green-500';
      case 'purple': return 'border-purple-400 hover:border-purple-500';
      case 'orange': return 'border-orange-400 hover:border-orange-500';
      case 'pink': return 'border-pink-400 hover:border-pink-500';
      case 'indigo': return 'border-indigo-400 hover:border-indigo-500';
      case 'emerald': return 'border-emerald-400 hover:border-emerald-500';
      case 'gray': return 'border-gray-400 hover:border-gray-500';
      default: return 'border-blue-400 hover:border-blue-500';
    }
  };

  const handleRemove = () => {
    console.log('🗑️ Remove standalone card clicked:', { id: data.id, title: data.title, hasHandler: !!data.onRemove });
    if (data.onRemove && data.id) {
      data.onRemove(data.id);
    } else {
      console.warn('⚠️ onRemove handler missing or no ID:', { hasHandler: !!data.onRemove, id: data.id });
    }
  };
  
  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div
          className="w-[120px] h-[100px] bg-transparent flex items-center justify-center relative group cursor-context-menu"
          style={{ pointerEvents: 'auto' }}
          title={data.title}
        >
          {/* Atom box exactly like in molecule - centered with name below */}
          <div className="flex flex-col items-center justify-center w-full h-full">
            <div className={`p-3 rounded-md bg-white border-2 transition-all duration-200 hover:shadow-md hover:scale-105 bg-gradient-to-br from-white to-gray-50 group relative ${getBorderColor(categoryColor)}`}>
              <AtomIcon className="h-6 w-6 text-gray-600 hover:text-gray-700 transition-colors duration-200" />
              
              {/* Handles positioned on the atom box itself */}
              <Handle 
                id="left"
                type="target" 
                position={Position.Left}
                style={{ left: -6 }}
                className="w-3 h-3 !bg-primary !border-2 !border-background" 
              />
              <Handle 
                id="right"
                type="source" 
                position={Position.Right}
                style={{ right: -6 }}
                className="w-3 h-3 !bg-primary !border-2 !border-background" 
              />
            </div>
            
            {/* Atom Name below */}
            <p className="text-xs font-medium text-gray-700 leading-tight mt-2 text-center max-w-[100px] truncate">
              {data.title}
            </p>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-[200px] bg-white border border-gray-200 shadow-lg rounded-lg z-[9999]">
        <ContextMenuItem
          onClick={handleRemove}
          className="cursor-pointer text-red-600 hover:bg-red-50 focus:bg-red-50 focus:text-red-600"
        >
          Remove {data.title || data.atomId}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

const nodeTypes = { molecule: MoleculeNode, standaloneChip: StandaloneChipNode };

const STORAGE_KEY = 'workflow-canvas-molecules';

// Standard molecule dimensions - keep consistent across all operations
const MOLECULE_DIMENSIONS = {
  width: 240,  // Width of each molecule card (reduced from 280)
  height: 170, // Height of each molecule card (reduced from 200)
  spacing: 50  // Spacing between molecules (increased from 30 to 50)
};

// Custom Zoom Controls Component
const ZoomControls: React.FC<{ zoomLevel: number; onResetPositions: () => void }> = ({ zoomLevel, onResetPositions }) => {
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
        <Plus className="w-5 h-5 text-gray-700 font-bold stroke-2" />
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
          // Reset molecules to their default positions
          onResetPositions();
          // Also reset zoom to 1
          zoomTo(1);
        }}
        size="sm"
        className="w-12 h-12 p-0 rounded-full shadow-xl transition-all bg-green-100 border-2 border-green-400 text-green-700 hover:bg-green-200 hover:border-green-500"
        title="Reset molecules to default grid positions"
      >
        <Grid3X3 className="w-5 h-5" />
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
  onMoleculeReplace,
  onMoleculePositionsUpdate,
  onStandaloneCardRemove,
  isLibraryVisible = true,
  isRightPanelVisible = true,
  isAtomLibraryVisible = false,
  isRightPanelToolVisible = false,
  standaloneChips = []
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
    // Only save viewport changes that are meaningful (not just tiny movements)
    const threshold = 10;
    const lastViewport = localStorage.getItem('workflow-viewport');
    let shouldSave = true;
    
    if (lastViewport) {
      try {
        const last = JSON.parse(lastViewport);
        const deltaX = Math.abs((viewport.x || 0) - (last.x || 0));
        const deltaY = Math.abs((viewport.y || 0) - (last.y || 0));
        
        // Only save if movement is significant enough
        shouldSave = deltaX > threshold || deltaY > threshold;
      } catch (error) {
        // If parsing fails, save anyway
      }
    }
    
    if (shouldSave) {
      localStorage.setItem('workflow-viewport', JSON.stringify(viewport));
    }
  }, []);

  // Load viewport state from localStorage on mount (only position, not zoom)
  useEffect(() => {
    if (reactFlowInstance) {
      const savedViewport = localStorage.getItem('workflow-viewport');
      if (savedViewport) {
        try {
          const viewport = JSON.parse(savedViewport);
          // Only restore position, keep default zoom level to prevent size changes
          reactFlowInstance.setViewport({
            x: viewport.x || 0,
            y: viewport.y || 0,
            zoom: 1 // Always use zoom level 1 to prevent size inconsistencies
          });
          setZoomLevel(1);
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

  const onAddToContainer = useCallback((containerId: string, molecule: any) => {
    setNodes(ns =>
      ns.map(node =>
        node.id === containerId
          ? {
              ...node,
              data: {
                ...node.data,
                // Replace the container with the actual molecule
                id: molecule.id,
                type: molecule.type || 'qm',
                title: molecule.title,
                subtitle: molecule.subtitle || '',
                tag: molecule.tag || '',
                atoms: molecule.atoms || [],
                selectedAtoms: {},
                atomOrder: molecule.atoms || [],
                containedMolecules: undefined // Remove container functionality
              }
            }
          : node
      )
    );
    
    // Also update the parent state
    if (onMoleculeReplace) {
      onMoleculeReplace(containerId, molecule);
    }
  }, [onMoleculeReplace]);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    
    const moleculeData = event.dataTransfer.getData('application/json');
    const targetContainerId = event.dataTransfer.getData('text/container-id');
    
    if (!moleculeData) return;
    
    try {
      const molecule = JSON.parse(moleculeData);
      
      // If dropping into a container, add to that container instead of creating new node
      if (targetContainerId) {
        setNodes(ns =>
          ns.map(node =>
            node.id === targetContainerId
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    containedMolecules: [
                      ...(node.data.containedMolecules || []),
                      {
                        id: molecule.id,
                        title: molecule.title,
                        type: molecule.type || 'qm'
                      }
                    ]
                  }
                }
              : node
          )
        );
        
        console.log(`✅ Added molecule "${molecule.title}" to container "${targetContainerId}"`);
        return;
      }
      
      // Generate molecule ID in format: molecule_name-number
      const moleculeName = molecule.title.toLowerCase().replace(/\s+/g, '-');
      const timestamp = Date.now();
      const newNodeId = `${moleculeName}-${timestamp}`;
      
      // Calculate flexible position for new molecule
      const getFlexiblePosition = () => {
        const moleculesCount = nodes.length;
        // Calculate molecules per row based on panel visibility
        // Consider both left library and right panel tool visibility
        let moleculesPerRow;
        if (isLibraryVisible && isRightPanelToolVisible) {
          moleculesPerRow = 2; // Both left library and right panel tool visible
        } else if (isLibraryVisible && !isRightPanelToolVisible) {
          moleculesPerRow = 3; // Only left library visible
        } else if (!isLibraryVisible && isRightPanelToolVisible) {
          moleculesPerRow = 3; // Only right panel tool visible
        } else {
          moleculesPerRow = 4; // Both hidden (default case)
        }
        const padding = 60; // Padding around molecules
        
        const row = Math.floor(moleculesCount / moleculesPerRow);
        const col = moleculesCount % moleculesPerRow;
        
        return {
          x: padding + (col * (MOLECULE_DIMENSIONS.width + MOLECULE_DIMENSIONS.spacing)),
          y: padding + (row * (MOLECULE_DIMENSIONS.height + MOLECULE_DIMENSIONS.spacing))
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
          containedMolecules: [], // NEW: Track molecules inside this container
          onAtomToggle,
          onAtomReorder,
          onRemove: removeNode,
          onClick: onMoleculeSelect,
          onMoveAtomToMolecule,
          onMoveAtomToAtomList,
          onRename: onMoleculeRename,
          onAddToContainer, // NEW: Add molecule to container
          availableMolecules: canvasMolecules.map(m => ({ id: m.id, title: m.title }))
        }
      };
      
      // Update nodes - no auto-connection, molecules act as containers
      setNodes(ns => [...ns, newNode]);
      
      console.log(`✅ Added molecule "${molecule.title}" to canvas as container`);
      
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
          connections: [],
          selectedAtoms: {},
          atomOrder: molecule.atoms || []
        };
        onMoleculeAdd(canvasMolecule);
      }
      
    } catch (error) {
      console.error('Error parsing dropped molecule data:', error);
    }
  }, [reactFlowInstance, onAtomToggle, onAtomReorder, removeNode, onMoleculeSelect, onMoveAtomToMolecule, onMoveAtomToAtomList, canvasMolecules, nodes, isLibraryVisible, isRightPanelToolVisible]);

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

  // Function to reset molecules to their default positions
  const resetMoleculesToDefaultPositions = useCallback(() => {
    if (!reactFlowInstance || canvasMolecules.length === 0) return;

    console.log('🔄 Resetting molecules to default positions...');

    // Calculate molecules per row based on current panel visibility
    let moleculesPerRow;
    if (isLibraryVisible && isRightPanelToolVisible) {
      moleculesPerRow = 2; // Both left library and right panel tool visible
    } else if (isLibraryVisible && !isRightPanelToolVisible) {
      moleculesPerRow = 3; // Only left library visible
    } else if (!isLibraryVisible && isRightPanelToolVisible) {
      moleculesPerRow = 3; // Only right panel tool visible
    } else {
      moleculesPerRow = 4; // Both hidden (default case)
    }

    const startX = 60;
    const startY = 60;

    // Calculate new positions and update both nodes and parent state
    const positionUpdates: { moleculeId: string; position: { x: number; y: number } }[] = [];
    
    setNodes(prevNodes => 
      prevNodes.map((node, index) => {
        const row = Math.floor(index / moleculesPerRow);
        const col = index % moleculesPerRow;
        
        const positionX = startX + (col * (MOLECULE_DIMENSIONS.width + MOLECULE_DIMENSIONS.spacing));
        const positionY = startY + (row * (MOLECULE_DIMENSIONS.height + MOLECULE_DIMENSIONS.spacing));
        
        const newPosition = { x: positionX, y: positionY };
        console.log(`📍 Reset position for molecule "${node.data.title}" (${index}):`, newPosition);
        
        // Track position update for parent state
        positionUpdates.push({
          moleculeId: node.id,
          position: newPosition
        });
        
        return {
          ...node,
          position: newPosition
        };
      })
    );

    // Update parent state with new positions
    if (onMoleculePositionsUpdate && positionUpdates.length > 0) {
      onMoleculePositionsUpdate(positionUpdates);
    }

    // Reset viewport to show the grid from the beginning
    setTimeout(() => {
      if (reactFlowInstance) {
        reactFlowInstance.setViewport({ x: 0, y: 0, zoom: 1 });
      }
    }, 100);

    console.log('✅ Molecules reset to default positions');
  }, [reactFlowInstance, canvasMolecules.length, isLibraryVisible, isRightPanelToolVisible, onMoleculePositionsUpdate]);

  // Removed localStorage loading - parent WorkflowMode now manages molecules

  // Trigger re-render when panel visibility changes (reposition molecules based on new layout)
  useEffect(() => {
    // Clear any cached positions and force recalculation
    console.log(`📐 Panel visibility changed: Library ${isLibraryVisible ? 'visible' : 'hidden'}, Right Panel Tool ${isRightPanelToolVisible ? 'visible' : 'hidden'} - molecules will be repositioned`);
    
    // Force a re-render by updating nodes with current visibility state
    if (canvasMolecules.length > 0) {
      // This will trigger the main useEffect to recalculate positions
      setNodes(prevNodes => [...prevNodes]);
    }
  }, [isLibraryVisible, isRightPanelToolVisible, canvasMolecules.length]);

  // Update nodes when canvasMolecules change
  useEffect(() => {
    // First, create molecule nodes
    const moleculeNodes: Node<MoleculeNodeData>[] = canvasMolecules.map((molecule, index) => {
      const position = { x: 0, y: 0 }; // Will be calculated later
      
      return {
        id: molecule.id,
        type: 'molecule',
        dragHandle: '.drag-handle',
        position: position,
        data: {
          id: molecule.id,
          type: molecule.type || '',
          title: molecule.title,
          subtitle: molecule.subtitle || '',
          tag: molecule.tag || '',
          atoms: molecule.atoms || [],
          selectedAtoms: molecule.selectedAtoms || {},
          atomOrder: molecule.atomOrder || [],
          containedMolecules: molecule.containedMolecules || [], // NEW: Track molecules inside this container
          onAtomToggle,
          onAtomReorder,
          onRemove: removeNode,
          onClick: onMoleculeSelect,
          onMoveAtomToMolecule,
          onMoveAtomToAtomList,
          onRename: onMoleculeRename,
          onAddToContainer, // NEW: Add molecule to container
          availableMolecules: canvasMolecules.map(m => ({ id: m.id, title: m.title }))
        }
      };
    });
    
    // Now create chip nodes with placeholder positions
    const chipNodes: Node<StandaloneChipData>[] = standaloneChips.map((chip, index) => ({
      id: `chip-${chip.id}-${index}`,
      type: 'standaloneChip',
      position: { x: 0, y: 0 }, // Will be calculated later
      draggable: false,
      selectable: true,
      data: { 
        id: chip.id, 
        title: chip.title || chip.atomId, 
        atomId: chip.atomId,
        onRemove: onStandaloneCardRemove
      }
    }));
    
    // Build combined list treating chips as regular nodes in the flow
    // Chips at position i should come AFTER molecule i in the sequence
    const allNodes: Array<{ node: Node<any>, originalIndex: number, isChip: boolean, chipPosition?: number }> = [];
    
    // Insert molecules and chips in order
    // NEW: Use explicit molecule references (betweenMolecules, afterLastMolecule, beforeFirstMolecule)
    // FALLBACK: Use position-based logic for backward compatibility
    
    // Create a map of molecule IDs to their indices for quick lookup
    const moleculeIdToIndex = new Map<string, number>();
    moleculeNodes.forEach((node, index) => {
      moleculeIdToIndex.set(node.data.id, index);
    });
    
    // Group chips by their placement logic
    const chipsBeforeFirst: typeof chipNodes = [];
    const chipsAfterMolecules: Array<{ chip: Node<StandaloneChipData>, afterIndex: number }> = [];
    const chipsAfterLast: typeof chipNodes = [];
    
    standaloneChips.forEach((chip) => {
      const chipNode = chipNodes.find(cn => cn.data.id === chip.id);
      if (!chipNode) return;
      
      // Check for new explicit molecule reference format
      if (chip.betweenMolecules && Array.isArray(chip.betweenMolecules) && chip.betweenMolecules.length === 2) {
        // Chip is explicitly between two molecules
        const [firstMoleculeId, secondMoleculeId] = chip.betweenMolecules;
        const firstIndex = moleculeIdToIndex.get(firstMoleculeId);
        const secondIndex = moleculeIdToIndex.get(secondMoleculeId);
        
        if (firstIndex !== undefined && secondIndex !== undefined && firstIndex === secondIndex - 1) {
          // Valid between-molecules placement
          chipsAfterMolecules.push({ chip: chipNode, afterIndex: firstIndex });
        }
      } else if (chip.afterMoleculeId) {
        // Chip is after a specific molecule
        const afterIndex = moleculeIdToIndex.get(chip.afterMoleculeId);
        if (afterIndex !== undefined) {
          if (chip.afterLastMolecule && afterIndex === moleculeNodes.length - 1) {
            // After last molecule
            chipsAfterLast.push(chipNode);
          } else if (!chip.afterLastMolecule && afterIndex < moleculeNodes.length - 1) {
            // Between molecules (afterIndex and afterIndex+1)
            chipsAfterMolecules.push({ chip: chipNode, afterIndex });
          } else if (chip.afterLastMolecule) {
            // After last molecule (even if not the very last index)
            chipsAfterLast.push(chipNode);
          }
        }
      } else if (chip.beforeFirstMolecule) {
        // Chip is before the first molecule
        chipsBeforeFirst.push(chipNode);
      } else if (chip.afterLastMolecule) {
        // Chip is after the last molecule
        chipsAfterLast.push(chipNode);
      } else if (typeof chip.position === 'number') {
        // FALLBACK: Use position-based logic for backward compatibility
        const position = chip.position;
        
        if (position < 0 || (position >= 0 && position < 1)) {
          // Before first molecule
          chipsBeforeFirst.push(chipNode);
        } else if (position >= moleculeNodes.length) {
          // After last molecule
          chipsAfterLast.push(chipNode);
        } else {
          // Between molecules: position in range [i+1, i+2) means after molecule i
          for (let i = 0; i < moleculeNodes.length; i++) {
            if (position >= (i + 1) && position < (i + 2)) {
              chipsAfterMolecules.push({ chip: chipNode, afterIndex: i });
              break;
            }
          }
        }
      } else {
        // No position or reference - assume after last molecule
        chipsAfterLast.push(chipNode);
      }
    });
    
    // Sort chipsAfterMolecules by afterIndex to maintain order
    chipsAfterMolecules.sort((a, b) => a.afterIndex - b.afterIndex);
    
    // Build the combined list
    // Add chips before first molecule
    chipsBeforeFirst.forEach(chipNode => {
      if (!allNodes.find(an => an.node.id === chipNode.id)) {
        allNodes.push({ node: chipNode, originalIndex: -1, isChip: true });
      }
    });
    
    // Add molecules and their associated chips
    let chipsAfterIndex = 0;
    for (let i = 0; i < moleculeNodes.length; i++) {
      // Add molecule
      allNodes.push({ node: moleculeNodes[i], originalIndex: i, isChip: false });
      
      // Add any chips that should appear after this molecule
      while (chipsAfterIndex < chipsAfterMolecules.length && chipsAfterMolecules[chipsAfterIndex].afterIndex === i) {
        const { chip: chipNode } = chipsAfterMolecules[chipsAfterIndex];
        if (!allNodes.find(an => an.node.id === chipNode.id)) {
          allNodes.push({ node: chipNode, originalIndex: -1, isChip: true });
        }
        chipsAfterIndex++;
      }
    }
    
    // Add chips after last molecule
    chipsAfterLast.forEach(chipNode => {
      if (!allNodes.find(an => an.node.id === chipNode.id)) {
        allNodes.push({ node: chipNode, originalIndex: -1, isChip: true });
      }
    });
    
    // Now calculate positions for all nodes in the grid
    let moleculesPerRow;
    if (isLibraryVisible && isRightPanelToolVisible) {
      moleculesPerRow = 2;
    } else if (isLibraryVisible && !isRightPanelToolVisible) {
      moleculesPerRow = 3;
    } else if (!isLibraryVisible && isRightPanelToolVisible) {
      moleculesPerRow = 3;
    } else {
      moleculesPerRow = 4;
    }
    console.log(`📐 Layout: Library ${isLibraryVisible ? 'visible' : 'hidden'}, Right Panel Tool ${isRightPanelToolVisible ? 'visible' : 'hidden'}, using ${moleculesPerRow} columns`);
    
    const startX = 60;
    const startY = 60;
    
    allNodes.forEach((item, index) => {
      const row = Math.floor(index / moleculesPerRow);
      const col = index % moleculesPerRow;
      
      // Calculate base position using molecule dimensions
      const baseX = startX + (col * (MOLECULE_DIMENSIONS.width + MOLECULE_DIMENSIONS.spacing));
      const baseY = startY + (row * (MOLECULE_DIMENSIONS.height + MOLECULE_DIMENSIONS.spacing));
      
      // Adjust position for atoms (smaller) to center-align vertically with molecules
      if (item.isChip) {
        const atomNode = item.node;
        const atomHeight = 100; // Height of atom node
        const verticalOffset = (MOLECULE_DIMENSIONS.height - atomHeight) / 2;
        item.node.position = { x: baseX, y: baseY + verticalOffset };
      } else {
        item.node.position = { x: baseX, y: baseY };
      }
      
      console.log(`📍 Position for ${item.isChip ? 'chip' : 'molecule'} "${item.node.data.title || item.node.id}" (${index}):`, item.node.position);
    });
    
    const newNodes = allNodes.map(item => item.node);

    // Create edges following simple left-to-right flow
    const newEdges: Edge[] = [];
    
    console.log(`🔗 Creating edges for ${newNodes.length} nodes with ${moleculesPerRow} columns per row`);
    
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
            type: 'step',
            style: { stroke: 'hsl(var(--primary))', strokeWidth: 2, strokeDasharray: '5,5' },
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
            type: 'step',
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
  }, [canvasMolecules, standaloneChips, onAtomToggle, onAtomReorder, removeNode, onMoleculeSelect, isLibraryVisible, isRightPanelToolVisible]);


  // Removed the useEffect that was causing infinite loop
  // The parent WorkflowMode now manages molecules directly

  return (
    <div className="h-full w-full relative z-0 bg-gradient-to-br from-background via-card/50 to-muted/20 rounded-lg border-2 border-border/50 shadow-elegant backdrop-blur-sm">
      <div
        ref={reactFlowWrapper}
        className="w-full h-full custom-scrollbar workflow-canvas-container"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: '#9ca3af #e5e7eb',
          height: '100%',
          width: '100%',
          minHeight: '100%',
          position: 'relative',
          overflow: 'auto', // Enable scrolling for large content
          zIndex: 0
        }}
      >
        {/* Plus Button for Creating Molecules */}
        {onCreateMolecule && (
          <Button
            className="absolute top-4 right-4 z-10 rounded-lg w-12 h-10 p-0 shadow-lg bg-blue-600 hover:bg-blue-700 border-2 border-blue-500"
          onClick={handleCreateMoleculeClick}
          title="Create New Molecule"
          >
            <PlusCircle className="w-5 h-5 text-white" />
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
            onNodeContextMenu={(e, node) => {
              // Allow ReactFlow nodes to handle their own context menus
              // This prevents ReactFlow from blocking the context menu
              e.preventDefault();
            }}
            zoomOnScroll={false}
            zoomOnPinch={false}
            zoomOnDoubleClick={false}
            fitView={false}
            minZoom={0.1}
            maxZoom={4}
            defaultZoom={1}
            proOptions={{ hideAttribution: true }}
            // Enhanced scrolling and panning configuration
            panOnScroll={true}
            panOnScrollMode="free"
            panOnScrollSpeed={1.2}
            // Enable smooth panning and better scroll behavior
            panOnDrag={true}
            selectNodesOnDrag={false}
            // Prevent scroll conflicts while maintaining smooth experience
            preventScrolling={false}
            // Better handling of large content areas
            snapToGrid={false}
            snapGrid={[15, 15]}
            // Ensure nodes don't interfere with scrolling
            nodesDraggable={true}
            nodesConnectable={false}
            elementsSelectable={true}
            style={{
              width: '100%',
              height: '100%',
              minHeight: '100%',
              maxHeight: '100%',
              position: 'absolute',
              top: 0,
              left: 0,
              zIndex: 0
            }}
          >
            <Background gap={24} color="hsl(var(--border) / 0.3)" className="opacity-50" />
            <ZoomControls zoomLevel={zoomLevel} onResetPositions={resetMoleculesToDefaultPositions} />
        </ReactFlow>
        </ReactFlowProvider>
      </div>
    </div>
  );
};

export default WorkflowCanvas;