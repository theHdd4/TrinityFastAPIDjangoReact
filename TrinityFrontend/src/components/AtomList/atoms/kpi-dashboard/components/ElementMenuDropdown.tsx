import React from 'react';
import { MoreVertical, Trash2, Plus, ArrowLeft, ArrowRight } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { ElementType } from './ElementDropdown';

interface ElementMenuDropdownProps {
  elementTypes: { value: ElementType; label: string; icon: React.ElementType }[];
  onElementChange: (elementType: ElementType) => void;
  boxId: string;
  layoutId: string;
  onDeleteBox: (layoutId: string, boxId: string) => void;
  onAddElement: (layoutId: string, boxId: string, position: 'left' | 'right') => void;
  selectedBoxIds?: string[];
  boxesInRow: number; // Number of boxes in the current row
}

const ElementMenuDropdown: React.FC<ElementMenuDropdownProps> = ({
  elementTypes,
  onElementChange,
  boxId,
  layoutId,
  onDeleteBox,
  onAddElement,
  selectedBoxIds = [],
  boxesInRow
}) => {
  const isMultiSelected = selectedBoxIds.length > 1 && selectedBoxIds.includes(boxId);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDeleteBox(layoutId, boxId);
  };

  const handleAddToLeft = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAddElement(layoutId, boxId, 'left');
  };

  const handleAddToRight = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAddElement(layoutId, boxId, 'right');
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className="absolute top-2 right-2 z-20 p-1.5 bg-white rounded-full shadow-md border border-gray-200 text-gray-600 hover:bg-gray-50 transition-opacity opacity-0 group-hover/box:opacity-100 flex items-center justify-center"
          title="More options"
        >
          <MoreVertical className="w-4 h-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger onClick={(e) => e.stopPropagation()}>
            Change Element
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48">
            {elementTypes.map((element) => {
              const Icon = element.icon;
              return (
                <DropdownMenuItem
                  key={element.value}
                  onClick={(e) => {
                    e.stopPropagation();
                    onElementChange(element.value);
                  }}
                  className="flex items-center gap-2"
                >
                  <Icon className="w-4 h-4" />
                  <span>{element.label}</span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        
        {/* Add Element option - always available for all element types */}
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger onClick={(e) => e.stopPropagation()}>
            <Plus className="w-4 h-4 mr-2" />
            Add Element
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48">
            <DropdownMenuItem
              onClick={handleAddToLeft}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Add to the Left</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleAddToRight}
              className="flex items-center gap-2"
            >
              <ArrowRight className="w-4 h-4" />
              <span>Add to the Right</span>
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Individual Delete option - always show, even in multi-selection */}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleDelete}
          className="flex items-center gap-2 text-red-600 focus:text-red-600 focus:bg-red-50"
        >
          <Trash2 className="w-4 h-4" />
          <span>Delete</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ElementMenuDropdown;

