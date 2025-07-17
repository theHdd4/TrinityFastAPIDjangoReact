import React, { useState, useRef, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GripVertical, X, Minimize2, Maximize2 } from 'lucide-react';
import { useExhibitionStore } from '../../ExhibitionMode/store/exhibitionStore';

interface FloatingNavigationListProps {
  isVisible: boolean;
  onClose: () => void;
}

const FloatingNavigationList: React.FC<FloatingNavigationListProps> = ({ isVisible, onClose }) => {
  const [position, setPosition] = useState({ x: 20, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const widgetRef = useRef<HTMLDivElement>(null);
  const { cards } = useExhibitionStore();

  // Get all atoms from cards
  const allAtoms = cards.flatMap(card => 
    card.atoms.map(atom => ({
      id: atom.id,
      title: atom.title,
      category: atom.category,
      color: atom.color,
      cardId: card.id
    }))
  );

  const scrollToCard = (cardId: string) => {
    const cardElement = document.querySelector(`[data-card-id="${cardId}"]`);
    if (cardElement) {
      cardElement.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start' 
      });
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!widgetRef.current) return;
    
    const rect = widgetRef.current.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
    setIsDragging(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      
      setPosition({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  if (!isVisible) return null;

  return (
    <div
      ref={widgetRef}
      className="fixed z-50 select-none"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        cursor: isDragging ? 'grabbing' : 'default'
      }}
    >
      <Card className="bg-white/95 backdrop-blur-sm shadow-lg border border-gray-200 min-w-[250px] max-w-[300px]">
        {/* Header */}
        <div 
          className="flex items-center justify-between p-3 border-b border-gray-200 cursor-grab active:cursor-grabbing bg-gray-50"
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center space-x-2">
            <GripVertical className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-700">Navigation List</span>
          </div>
          <div className="flex items-center space-x-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => setIsMinimized(!isMinimized)}
            >
              {isMinimized ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={onClose}
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        </div>

        {/* Content */}
        {!isMinimized && (
          <div className="p-3">
            {allAtoms.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-sm text-gray-500">No atoms in canvas</p>
                <p className="text-xs text-gray-400 mt-1">Drag atoms to see them here</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {allAtoms.map((atom) => (
                  <div
                    key={atom.id}
                    className="flex items-center space-x-2 p-2 bg-gray-50 rounded-md hover:bg-gray-100 transition-colors cursor-pointer"
                    onClick={() => scrollToCard(atom.cardId)}
                  >
                    <div className={`w-2 h-2 ${atom.color} rounded-full flex-shrink-0`}></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{atom.title}</p>
                      <p className="text-xs text-gray-500 truncate">{atom.category}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {allAtoms.length > 0 && (
              <div className="mt-3 pt-2 border-t border-gray-200">
                <p className="text-xs text-gray-500 text-center">
                  {allAtoms.length} atom{allAtoms.length !== 1 ? 's' : ''} in canvas
                </p>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
};

export default FloatingNavigationList;
