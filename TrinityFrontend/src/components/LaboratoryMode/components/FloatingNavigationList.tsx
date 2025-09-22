import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GripVertical, X, Minimize2, Maximize2 } from 'lucide-react';
import { useExhibitionStore } from '../../ExhibitionMode/store/exhibitionStore';

interface FloatingNavigationListProps {
  isVisible: boolean;
  onClose: () => void;
  anchorSelector?: string;
  isReady?: boolean;
}

const VIEWPORT_PADDING = 24;
const DEFAULT_POSITION = { x: VIEWPORT_PADDING, y: 120 };

const FloatingNavigationList: React.FC<FloatingNavigationListProps> = ({
  isVisible,
  onClose,
  anchorSelector,
  isReady = true,
}) => {
  const [position, setPosition] = useState(DEFAULT_POSITION);
  const [isDragging, setIsDragging] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isFadingIn, setIsFadingIn] = useState(false);
  const widgetRef = useRef<HTMLDivElement>(null);
  const manualPositionRef = useRef(false);
  const { cards } = useExhibitionStore();

  const clampPositionToViewport = useCallback((x: number, y: number) => {
    if (typeof window === 'undefined' || !widgetRef.current) {
      return { x, y };
    }

    const widgetRect = widgetRef.current.getBoundingClientRect();
    const maxX = window.innerWidth - widgetRect.width - VIEWPORT_PADDING;
    const maxY = window.innerHeight - widgetRect.height - VIEWPORT_PADDING;

    return {
      x: Math.min(Math.max(x, VIEWPORT_PADDING), Math.max(VIEWPORT_PADDING, maxX)),
      y: Math.min(Math.max(y, VIEWPORT_PADDING), Math.max(VIEWPORT_PADDING, maxY)),
    };
  }, []);

  const alignToAnchor = useCallback(() => {
    if (!anchorSelector || typeof window === 'undefined' || manualPositionRef.current) {
      return;
    }

    const anchorElement = document.querySelector(anchorSelector) as HTMLElement | null;
    const widgetElement = widgetRef.current;

    if (!anchorElement || !widgetElement) {
      return;
    }

    const anchorRect = anchorElement.getBoundingClientRect();
    const widgetRect = widgetElement.getBoundingClientRect();

    if (widgetRect.width === 0 && widgetRect.height === 0) {
      return;
    }

    const viewportWidth = window.innerWidth;
    const anchorCenteredX = Math.max(
      anchorRect.right + VIEWPORT_PADDING,
      (viewportWidth - widgetRect.width) / 2,
    );
    const anchorCenteredY = anchorRect.top + anchorRect.height / 2 - widgetRect.height / 2;

    const nextPosition = clampPositionToViewport(anchorCenteredX, anchorCenteredY);

    setPosition(previous => {
      if (previous.x === nextPosition.x && previous.y === nextPosition.y) {
        return previous;
      }
      return nextPosition;
    });
  }, [anchorSelector, clampPositionToViewport]);

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

  useLayoutEffect(() => {
    if (!isVisible || !isReady || manualPositionRef.current || !anchorSelector) {
      return;
    }

    let frameId = 0;

    const attemptAlignment = () => {
      if (typeof window === 'undefined') {
        return;
      }

      const anchorElement = anchorSelector
        ? (document.querySelector(anchorSelector) as HTMLElement | null)
        : null;
      const widgetElement = widgetRef.current;

      if (!anchorElement || !widgetElement) {
        frameId = window.requestAnimationFrame(attemptAlignment);
        return;
      }

      const widgetRect = widgetElement.getBoundingClientRect();
      if (widgetRect.width === 0 && widgetRect.height === 0) {
        frameId = window.requestAnimationFrame(attemptAlignment);
        return;
      }

      alignToAnchor();
    };

    attemptAlignment();

    return () => {
      if (typeof window !== 'undefined' && frameId) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [alignToAnchor, anchorSelector, isReady, isVisible]);

  useEffect(() => {
    if (!isVisible || !isReady || manualPositionRef.current || !anchorSelector) {
      return;
    }

    if (typeof window === 'undefined') {
      return;
    }

    const handleResize = () => {
      alignToAnchor();
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [alignToAnchor, anchorSelector, isReady, isVisible]);

  useEffect(() => {
    if (isVisible && isReady) {
      setIsFadingIn(true);
    } else {
      setIsFadingIn(false);
    }
  }, [isVisible, isReady]);

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
    manualPositionRef.current = true;
    setIsDragging(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      const nextPosition = clampPositionToViewport(
        e.clientX - dragOffset.x,
        e.clientY - dragOffset.y,
      );

      setPosition(previous => {
        if (previous.x === nextPosition.x && previous.y === nextPosition.y) {
          return previous;
        }
        return nextPosition;
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
  }, [clampPositionToViewport, isDragging, dragOffset]);

  if (!isVisible || !isReady) return null;

  return (
    <div
      ref={widgetRef}
      className="fixed z-50 select-none transition-opacity duration-500 ease-out"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        cursor: isDragging ? 'grabbing' : 'default',
        opacity: isFadingIn ? 1 : 0,
        pointerEvents: isFadingIn ? 'auto' : 'none',
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
