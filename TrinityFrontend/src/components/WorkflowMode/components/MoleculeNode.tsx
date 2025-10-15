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
    const colors: Record<string, { border: string; bg: string; badge: string; icon: string; glow: string }> = {
      'Build': { 
        border: 'border-purple-300', 
        bg: 'bg-gradient-to-br from-purple-50 via-purple-100/50 to-purple-200/30',
        badge: 'bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-lg',
        icon: '🔨',
        glow: 'shadow-purple-200'
      },
      'Data Pre-Process': { 
        border: 'border-blue-300', 
        bg: 'bg-gradient-to-br from-blue-50 via-blue-100/50 to-blue-200/30',
        badge: 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg',
        icon: '⚙️',
        glow: 'shadow-blue-200'
      },
      'Explore': { 
        border: 'border-emerald-300', 
        bg: 'bg-gradient-to-br from-emerald-50 via-emerald-100/50 to-emerald-200/30',
        badge: 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-lg',
        icon: '🔍',
        glow: 'shadow-emerald-200'
      },
      'Engineer': { 
        border: 'border-orange-300', 
        bg: 'bg-gradient-to-br from-orange-50 via-orange-100/50 to-orange-200/30',
        badge: 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg',
        icon: '⚡',
        glow: 'shadow-orange-200'
      },
      'Pre Process': { 
        border: 'border-amber-300', 
        bg: 'bg-gradient-to-br from-amber-50 via-amber-100/50 to-amber-200/30',
        badge: 'bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-lg',
        icon: '🔄',
        glow: 'shadow-amber-200'
      },
      'Evaluate': { 
        border: 'border-pink-300', 
        bg: 'bg-gradient-to-br from-pink-50 via-pink-100/50 to-pink-200/30',
        badge: 'bg-gradient-to-r from-pink-500 to-pink-600 text-white shadow-lg',
        icon: '📊',
        glow: 'shadow-pink-200'
      },
      'Plan': { 
        border: 'border-indigo-300', 
        bg: 'bg-gradient-to-br from-indigo-50 via-indigo-100/50 to-indigo-200/30',
        badge: 'bg-gradient-to-r from-indigo-500 to-indigo-600 text-white shadow-lg',
        icon: '📋',
        glow: 'shadow-indigo-200'
      },
      'Report': { 
        border: 'border-teal-300', 
        bg: 'bg-gradient-to-br from-teal-50 via-teal-100/50 to-teal-200/30',
        badge: 'bg-gradient-to-r from-teal-500 to-teal-600 text-white shadow-lg',
        icon: '📈',
        glow: 'shadow-teal-200'
      }
    };
    return colors[type] || { 
      border: 'border-slate-300', 
      bg: 'bg-gradient-to-br from-slate-50 via-slate-100/50 to-slate-200/30',
      badge: 'bg-gradient-to-r from-slate-500 to-slate-600 text-white shadow-lg',
      icon: '⚙️',
      glow: 'shadow-slate-200'
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
        className={`relative p-6 select-none ${colorScheme.bg} ${colorScheme.border} border-2 transition-all duration-500 hover:shadow-2xl hover:scale-[1.02] backdrop-blur-sm ${
          selected ? 'ring-4 ring-primary/30 shadow-2xl scale-[1.05] shadow-primary/20' : `shadow-xl ${colorScheme.glow}`
        } ${isResizing ? 'shadow-2xl scale-[1.05]' : ''} group`}
        style={{
          width: `${nodeSize.width}px`,
          height: `${nodeSize.height}px`,
          minHeight: '320px',
          minWidth: '300px'
        }}
        onClick={e => {
          e.stopPropagation();
          data.onClick(id);
        }}
      >
        <div className="drag-handle cursor-move">
          {/* Header with Icon and Remove Button */}
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="text-2xl">{colorScheme.icon}</div>
              <div>
                <Badge className={`text-xs font-bold px-4 py-1.5 ${colorScheme.badge} shadow-lg`}>
                  {data.type}
                </Badge>
                <div className="mt-2">
                  <Badge variant="outline" className="text-xs bg-white/50 backdrop-blur-sm border-white/30">
                    {data.atoms.length} atoms
                  </Badge>
                </div>
              </div>
            </div>
            <button
              className="p-2 rounded-xl bg-white/60 backdrop-blur-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-300 shadow-lg hover:shadow-xl group-hover:scale-110"
              onClick={e => {
                e.stopPropagation();
                data.onRemove(id);
              }}
              title="Remove molecule"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          
          {/* Title Section */}
          <div className="flex items-start gap-3 mb-6">
            <div className="p-2 rounded-xl bg-white/40 backdrop-blur-sm shadow-lg">
              <Move className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-foreground mb-2 text-lg leading-tight">{data.title}</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">{data.subtitle}</p>
            </div>
          </div>
        </div>
        <div className="space-y-4">
          {/* Divider */}
          <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent my-4"></div>
          
          {/* Atoms Header */}
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary"></div>
            <p className="text-sm font-bold text-foreground uppercase tracking-wider">Select Atoms</p>
          </div>
          
          {/* Atoms List */}
          <div
            className={`${isExpanded ? 'max-h-80' : 'max-h-48'} overflow-y-auto pr-2 custom-scrollbar`}
            onPointerDownCapture={e => e.stopPropagation()}
          >
            <div className="space-y-2">
              {(isExpanded ? data.atomOrder : atomsToShow).map((atom, idx) => (
                <div
                  key={atom}
                  className={`flex items-center gap-3 text-sm bg-white/70 backdrop-blur-sm px-4 py-3 rounded-xl border transition-all duration-300 hover:shadow-lg group/atom ${
                    data.selectedAtoms[atom] 
                      ? 'bg-primary/10 border-primary/40 shadow-lg shadow-primary/20' 
                      : 'border-white/30 hover:border-primary/30 hover:bg-white/80'
                  }`}
                >
                  {/* Reorder Controls */}
                  <div className="flex flex-col gap-1">
                    <button
                      className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/50 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200"
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
                      className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/50 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200"
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
                  
                  {/* Checkbox */}
                  <Checkbox
                    checked={data.selectedAtoms[atom] || false}
                    onCheckedChange={checked => handleAtomToggle(atom, !!checked)}
                    className="w-5 h-5 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                  />
                  
                  {/* Atom Name */}
                  <span className="flex-1 text-foreground font-medium group-hover/atom:text-primary transition-colors duration-200">
                    {atom}
                  </span>
                  
                  {/* Selection Indicator */}
                  {data.selectedAtoms[atom] && (
                    <div className="w-2 h-2 rounded-full bg-primary shadow-lg"></div>
                  )}
                </div>
              ))}
            </div>
            {!isExpanded && hasMoreAtoms && (
              <button
                onClick={e => {
                  e.stopPropagation();
                  setIsExpanded(true);
                }}
                className="w-full text-sm text-primary font-semibold hover:text-primary/80 cursor-pointer mt-4 py-3 px-4 bg-gradient-to-r from-primary/10 to-primary/5 hover:from-primary/20 hover:to-primary/10 rounded-xl border border-primary/30 hover:border-primary/50 transition-all duration-300 shadow-lg hover:shadow-xl backdrop-blur-sm"
              >
                <div className="flex items-center justify-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary"></div>
                  Show {data.atomOrder.length - 3} more atoms
                  <div className="w-2 h-2 rounded-full bg-primary"></div>
                </div>
              </button>
            )}
            {isExpanded && hasMoreAtoms && (
              <button
                onClick={e => {
                  e.stopPropagation();
                  setIsExpanded(false);
                }}
                className="w-full text-sm text-muted-foreground font-semibold hover:text-foreground cursor-pointer mt-4 py-3 px-4 bg-white/50 hover:bg-white/70 rounded-xl border border-white/30 hover:border-white/50 transition-all duration-300 shadow-lg hover:shadow-xl backdrop-blur-sm"
              >
                <div className="flex items-center justify-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-muted-foreground"></div>
                  Show less
                  <div className="w-2 h-2 rounded-full bg-muted-foreground"></div>
                </div>
              </button>
            )}
          </div>
        </div>
        
        {/* Resize Handle */}
        <div
          className={`absolute bottom-0 right-0 w-8 h-8 cursor-se-resize group transition-all duration-300 ${
            isResizing ? 'scale-125' : 'hover:scale-110'
          }`}
          onMouseDown={handleResizeStart}
          title="Drag to resize"
        >
          <div className={`w-full h-full rounded-tl-2xl transition-all duration-300 ${
            isResizing 
              ? 'bg-gradient-to-tl from-primary to-primary/80 shadow-lg shadow-primary/30' 
              : 'bg-gradient-to-tl from-border/60 to-border/40 hover:from-primary/60 hover:to-primary/40 hover:shadow-md'
          }`} style={{
            clipPath: 'polygon(100% 0%, 0% 100%, 100% 100%)'
          }}>
            <div className="absolute bottom-2 right-2 flex flex-col gap-1">
              <div className={`w-4 h-0.5 rounded-full transition-colors duration-200 ${
                isResizing ? 'bg-white shadow-sm' : 'bg-muted-foreground/60 group-hover:bg-primary/80'
              }`}></div>
              <div className={`w-3 h-0.5 rounded-full transition-colors duration-200 ${
                isResizing ? 'bg-white shadow-sm' : 'bg-muted-foreground/60 group-hover:bg-primary/80'
              }`}></div>
              <div className={`w-2 h-0.5 rounded-full transition-colors duration-200 ${
                isResizing ? 'bg-white shadow-sm' : 'bg-muted-foreground/60 group-hover:bg-primary/80'
              }`}></div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default MoleculeNode;