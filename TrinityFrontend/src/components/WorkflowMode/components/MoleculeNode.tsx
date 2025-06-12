import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Trash2, ArrowUp, ArrowDown } from 'lucide-react';
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
}


const MoleculeNode: React.FC<NodeProps<MoleculeNodeData>> = ({ id, data }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const atomsToShow = isExpanded ? data.atomOrder : data.atomOrder.slice(0, 3);
  const hasMoreAtoms = data.atomOrder.length > 3;

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'Build':
        return 'border-purple-300 bg-purple-50';
      case 'Data Pre-Process':
        return 'border-blue-300 bg-blue-50';
      case 'Explore':
        return 'border-green-300 bg-green-50';
      case 'Engineer':
        return 'border-orange-300 bg-orange-50';
      case 'Pre Process':
        return 'border-yellow-300 bg-yellow-50';
      default:
        return 'border-gray-300 bg-gray-50';
    }
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

  return (
    <div className="relative">
      <Handle type="target" position={Position.Left} className="w-3 h-3 !bg-gray-500" />
      <Handle type="source" position={Position.Right} className="w-3 h-3 !bg-gray-500" />
      <Card
        className={`relative w-64 p-4 select-none ${getTypeColor(data.type)} border-2 ${
          isExpanded ? 'min-h-96' : ''
        }`}
        onClick={e => {
          e.stopPropagation();
          data.onClick(id);
        }}
      >
        <div className="drag-handle cursor-move">
          <button
            className="absolute top-1 right-1 text-gray-400 hover:text-red-500"
            onClick={e => {
              e.stopPropagation();
              data.onRemove(id);
            }}
            title="Remove"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <div className="mb-3">
            <Badge variant="secondary" className="text-xs font-medium">
              {data.type}
            </Badge>
          </div>
          <h4 className="font-semibold text-gray-900 mb-1 text-sm">{data.title}</h4>
          <p className="text-xs text-gray-700 mb-3">{data.subtitle}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium text-gray-600">Atoms ({data.atoms.length}):</p>
          <div
            className={`${isExpanded ? 'max-h-72' : 'max-h-40'} overflow-y-auto`}
            onPointerDownCapture={e => e.stopPropagation()}
          >
            <div className="space-y-2">
              {(isExpanded ? data.atomOrder : atomsToShow).map((atom, idx) => (
                <div
                  key={atom}
                  className="flex items-center space-x-2 text-xs bg-white px-2 py-1 rounded hover:bg-gray-50"
                >
                  <div className="flex flex-col -my-1">
                    <button
                      className="text-gray-400 hover:text-gray-600 disabled:opacity-40"
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
                      className="text-gray-400 hover:text-gray-600 disabled:opacity-40"
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
                  <span className="flex-1 text-gray-600">{atom}</span>
                </div>
              ))}
            </div>
            {!isExpanded && hasMoreAtoms && (
              <button
                onClick={e => {
                  e.stopPropagation();
                  setIsExpanded(true);
                }}
                className="text-xs text-gray-500 italic hover:text-gray-700 cursor-pointer mt-2"
              >
                +{data.atomOrder.length - 3} more atoms
              </button>
            )}
            {isExpanded && hasMoreAtoms && (
              <button
                onClick={e => {
                  e.stopPropagation();
                  setIsExpanded(false);
                }}
                className="text-xs text-gray-500 italic hover:text-gray-700 cursor-pointer mt-2"
              >
                Show less
              </button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
};

export default MoleculeNode;
