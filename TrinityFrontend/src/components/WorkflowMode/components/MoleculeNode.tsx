import React, { useState, useRef, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Trash2, ArrowUp, ArrowDown, Move } from 'lucide-react';
import { Handle, NodeProps, Position } from 'reactflow';

export interface MoleculeNodeData {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  tag: string;
  atoms: string[];
  selectedAtoms: Record<string, boolean>;
  atomOrder: string[];
  onAtomToggle: (moleculeId: string, atom: string, checked: boolean) => void;
  onAtomReorder: (moleculeId: string, newOrder: string[]) => void;
  onRemove: (moleculeId: string) => void;
  onClick: (moleculeId: string) => void;
  width?: number;
  height?: number;
  onResize?: (nodeId: string, width: number, height: number) => void;
}


const MoleculeNode: React.FC<NodeProps<MoleculeNodeData>> = ({ id, data, selected }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [nodeSize, setNodeSize] = useState({ 
    width: data.width || 320, 
    height: data.height || 380 
  });
  const nodeRef = useRef<HTMLDivElement>(null);

  const atomsToShow = isExpanded ? data.atomOrder : data.atomOrder.slice(0, 3);
  const hasMoreAtoms = data.atomOrder.length > 3;

  const getTypeColor = (type: string) => {
    const colors: Record<string, { border: string; bg: string; badge: string }> = {
      'Build': { 
        border: 'border-purple-400', 
        bg: 'bg-gradient-to-br from-purple-50 to-purple-100',
        badge: 'bg-purple-500 text-white'
      },
      'Data Pre-Process': { 
        border: 'border-blue-400', 
        bg: 'bg-gradient-to-br from-blue-50 to-blue-100',
        badge: 'bg-blue-500 text-white'
      },
      'Explore': { 
        border: 'border-emerald-400', 
        bg: 'bg-gradient-to-br from-emerald-50 to-emerald-100',
        badge: 'bg-emerald-500 text-white'
      },
      'Engineer': { 
        border: 'border-orange-400', 
        bg: 'bg-gradient-to-br from-orange-50 to-orange-100',
        badge: 'bg-orange-500 text-white'
      },
      'Pre Process': { 
        border: 'border-amber-400', 
        bg: 'bg-gradient-to-br from-amber-50 to-amber-100',
        badge: 'bg-amber-500 text-white'
      },
      'Evaluate': { 
        border: 'border-pink-400', 
        bg: 'bg-gradient-to-br from-pink-50 to-pink-100',
        badge: 'bg-pink-500 text-white'
      },
      'Plan': { 
        border: 'border-indigo-400', 
        bg: 'bg-gradient-to-br from-indigo-50 to-indigo-100',
        badge: 'bg-indigo-500 text-white'
      },
      'Report': { 
        border: 'border-teal-400', 
        bg: 'bg-gradient-to-br from-teal-50 to-teal-100',
        badge: 'bg-teal-500 text-white'
      }
    };
    return colors[type] || { 
      border: 'border-slate-400', 
      bg: 'bg-gradient-to-br from-slate-50 to-slate-100',
      badge: 'bg-slate-500 text-white'
    };
  };

  const handleAtomToggle = (atom: string, checked: boolean) => {
    data.onAtomToggle(id, atom, checked);
  };

  const moveAtom = (atom: string, direction: 'up' | 'down') => {
    const index = data.atomOrder.indexOf(atom);
    if (index === -1) return;
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= data.atomOrder.length) return;
    const newOrder = [...data.atomOrder];
    newOrder.splice(index, 1);
    newOrder.splice(newIndex, 0, atom);
    data.onAtomReorder(id, newOrder);
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
  };

  const handleResize = (e: MouseEvent) => {
    if (!isResizing || !nodeRef.current) return;
    
    const rect = nodeRef.current.getBoundingClientRect();
    const newWidth = Math.max(280, Math.min(600, e.clientX - rect.left));
    const newHeight = Math.max(300, Math.min(800, e.clientY - rect.top));
    
    setNodeSize({ width: newWidth, height: newHeight });
  };

  const handleResizeEnd = () => {
    if (isResizing && data.onResize) {
      data.onResize(id, nodeSize.width, nodeSize.height);
    }
    setIsResizing(false);
  };

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleResize);
      document.addEventListener('mouseup', handleResizeEnd);
      return () => {
        document.removeEventListener('mousemove', handleResize);
        document.removeEventListener('mouseup', handleResizeEnd);
      };
    }
  }, [isResizing, nodeSize]);

  const colorScheme = getTypeColor(data.type);
  
  return (
    <div className="relative">
      <Handle 
        type="target" 
        position={Position.Left} 
        className="w-4 h-4 !bg-primary !border-2 !border-background hover:!scale-125 transition-transform" 
      />
      <Handle 
        type="source" 
        position={Position.Right} 
        className="w-4 h-4 !bg-primary !border-2 !border-background hover:!scale-125 transition-transform" 
      />
      <Card
        ref={nodeRef}
        className={`relative p-5 select-none ${colorScheme.bg} ${colorScheme.border} border-3 transition-all duration-300 hover:shadow-2xl ${
          selected ? 'ring-4 ring-primary ring-opacity-50 shadow-2xl scale-105' : 'shadow-lg'
        } ${isResizing ? 'shadow-2xl scale-105' : ''}`}
        style={{
          width: `${nodeSize.width}px`,
          height: `${nodeSize.height}px`,
          minHeight: '300px',
          minWidth: '280px'
        }}
        onClick={e => {
          e.stopPropagation();
          data.onClick(id);
        }}
      >
        <div className="drag-handle cursor-move">
          <button
            className="absolute top-2 right-2 p-1.5 rounded-lg bg-background/80 backdrop-blur-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-200 shadow-md"
            onClick={e => {
              e.stopPropagation();
              data.onRemove(id);
            }}
            title="Remove molecule"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 mb-4">
            <Badge className={`text-xs font-semibold px-3 py-1 ${colorScheme.badge} shadow-sm`}>
              {data.type}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {data.atoms.length} atoms
            </Badge>
          </div>
          <div className="flex items-start gap-2 mb-3">
            <Move className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-foreground mb-1 text-base leading-tight">{data.title}</h4>
              <p className="text-sm text-muted-foreground leading-snug">{data.subtitle}</p>
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <div className="h-px bg-border my-3"></div>
          <p className="text-sm font-semibold text-foreground uppercase tracking-wide">Select Atoms</p>
          <div
            className={`${isExpanded ? 'max-h-80' : 'max-h-48'} overflow-y-auto pr-1 custom-scrollbar`}
            onPointerDownCapture={e => e.stopPropagation()}
          >
            <div className="space-y-1.5">
              {(isExpanded ? data.atomOrder : atomsToShow).map((atom, idx) => (
                <div
                  key={atom}
                  className={`flex items-center gap-2 text-sm bg-background/60 backdrop-blur-sm px-3 py-2.5 rounded-lg border border-border/50 hover:border-primary/50 hover:bg-accent/50 transition-all duration-200 ${
                    data.selectedAtoms[atom] ? 'bg-primary/10 border-primary/30' : ''
                  }`}
                >
                  <div className="flex flex-col -my-1">
                    <button
                      className="text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
                      disabled={idx === 0}
                      onPointerDown={e => e.stopPropagation()}
                      onClick={e => {
                        e.stopPropagation();
                        moveAtom(atom, 'up');
                      }}
                    >
                      <ArrowUp className="w-3 h-3" />
                    </button>
                    <button
                      className="text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
                      disabled={idx === (isExpanded ? data.atomOrder.length - 1 : atomsToShow.length - 1)}
                      onPointerDown={e => e.stopPropagation()}
                      onClick={e => {
                        e.stopPropagation();
                        moveAtom(atom, 'down');
                      }}
                    >
                      <ArrowDown className="w-3 h-3" />
                    </button>
                  </div>
                  <Checkbox
                    checked={data.selectedAtoms[atom] || false}
                    onCheckedChange={checked => handleAtomToggle(atom, !!checked)}
                    className="w-4 h-4"
                  />
                  <span className="flex-1 text-foreground">{atom}</span>
                </div>
              ))}
            </div>
            {!isExpanded && hasMoreAtoms && (
              <button
                onClick={e => {
                  e.stopPropagation();
                  setIsExpanded(true);
                }}
                className="w-full text-sm text-primary font-medium hover:text-primary/80 cursor-pointer mt-2 py-2 px-3 bg-primary/5 hover:bg-primary/10 rounded-lg border border-primary/20 transition-all duration-200"
              >
                + Show {data.atomOrder.length - 3} more atoms
              </button>
            )}
            {isExpanded && hasMoreAtoms && (
              <button
                onClick={e => {
                  e.stopPropagation();
                  setIsExpanded(false);
                }}
                className="w-full text-sm text-muted-foreground font-medium hover:text-foreground cursor-pointer mt-2 py-2 px-3 bg-muted/30 hover:bg-muted/50 rounded-lg border border-border transition-all duration-200"
              >
                Show less
              </button>
            )}
          </div>
        </div>
        
        {/* Resize Handle */}
        <div
          className={`absolute bottom-0 right-0 w-6 h-6 cursor-se-resize group transition-all duration-200 ${
            isResizing ? 'scale-125' : 'hover:scale-110'
          }`}
          onMouseDown={handleResizeStart}
          title="Drag to resize"
        >
          <div className={`w-full h-full rounded-tl-lg transition-colors duration-200 ${
            isResizing ? 'bg-primary shadow-lg' : 'bg-border/50 hover:bg-primary/50'
          }`} style={{
            clipPath: 'polygon(100% 0%, 0% 100%, 100% 100%)'
          }}>
            <div className="absolute bottom-1 right-1 flex flex-col gap-0.5">
              <div className={`w-3 h-0.5 rounded-full ${isResizing ? 'bg-white' : 'bg-muted-foreground'}`}></div>
              <div className={`w-2 h-0.5 rounded-full ${isResizing ? 'bg-white' : 'bg-muted-foreground'}`}></div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default MoleculeNode;