import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

interface ColumnMetadata {
  is_created: boolean;
  is_transformed?: boolean;
  operation_type?: string;
  input_columns?: string[];
  parameters?: Record<string, any>;
  formula?: string;
  created_column_name?: string;
}

interface ColumnInfoIconProps {
  metadata: ColumnMetadata;
  tooltipContainer?: HTMLElement | null;
}

export const ColumnInfoIcon: React.FC<ColumnInfoIconProps> = ({ metadata, tooltipContainer }) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  // Handle mouse enter with immediate show
  const handleMouseEnter = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    setShowTooltip(true);
  }, []);

  // Handle mouse leave with delay to allow moving to tooltip
  const handleMouseLeave = useCallback(() => {
    hideTimeoutRef.current = setTimeout(() => {
      setShowTooltip(false);
    }, 150); // Small delay to allow mouse to move to tooltip
  }, []);

  // Show icon if column is created OR transformed (in-place operations)
  const shouldShowIcon = metadata && (metadata.is_created || metadata.is_transformed) && metadata.formula;
  
  if (!shouldShowIcon) {
    return null;
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDialogOpen(true);
  };

  // Custom tooltip positioning for container-aware rendering
  const renderCustomTooltip = () => {
    if (!showTooltip || !buttonRef.current || !tooltipContainer) return null;

    const buttonRect = buttonRef.current.getBoundingClientRect();
    const containerRect = tooltipContainer.getBoundingClientRect();
    
    // Calculate position relative to container
    // Position tooltip above the button, centered horizontally
    const tooltipHeight = 60; // Approximate tooltip height
    const tooltipWidth = 280; // max-w-xs = 20rem = 320px, but we'll use 280px for calculation
    const offset = 8; // Space between button and tooltip
    let top = buttonRect.top - containerRect.top - tooltipHeight - offset;
    let left = buttonRect.left - containerRect.left + buttonRect.width / 2;
    
    // Ensure tooltip doesn't go above container
    if (top < 0) {
      top = buttonRect.bottom - containerRect.top + offset; // Position below instead
    }
    
    // Boundary detection: ensure tooltip stays within container bounds
    const containerWidth = containerRect.width;
    const halfTooltipWidth = tooltipWidth / 2;
    const margin = 8; // Margin from container edges
    let transform = 'translateX(-50%)';
    
    // Calculate where tooltip would be if centered
    const tooltipLeftEdge = left - halfTooltipWidth;
    const tooltipRightEdge = left + halfTooltipWidth;
    
    // Check if tooltip would overflow on the left
    if (tooltipLeftEdge < margin) {
      // Align tooltip's left edge to container's left edge (with margin)
      left = margin;
      transform = 'none'; // Don't center, align to left
    }
    // Check if tooltip would overflow on the right
    else if (tooltipRightEdge > containerWidth - margin) {
      // Align tooltip's right edge to container's right edge (with margin)
      left = containerWidth - margin;
      transform = 'translateX(-100%)'; // Align to right
    }

    return (
      <div
        ref={tooltipRef}
        className="absolute z-50 max-w-xs rounded-md border bg-white px-3 py-1.5 text-sm text-gray-900 shadow-lg"
        style={{
          top: `${top}px`,
          left: `${left}px`,
          transform: transform,
          whiteSpace: 'normal',
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <p className="text-sm font-medium">Click to see how this column was created</p>
        <p className="text-xs mt-1 text-gray-600 break-words">{metadata.formula}</p>
      </div>
    );
  };

  // Use custom tooltip if container is provided, otherwise use Radix Tooltip
  return (
    <>
      {tooltipContainer ? (
        <div 
          className="relative inline-block" 
          onMouseEnter={handleMouseEnter} 
          onMouseLeave={handleMouseLeave}
        >
          <button
            ref={buttonRef}
            onClick={handleClick}
            className="inline-flex items-center justify-center w-5 h-5 rounded-full hover:bg-blue-100 text-blue-600 hover:text-blue-700 transition-colors border border-blue-200 bg-blue-50 flex-shrink-0"
            aria-label="Column creation info"
            style={{ minWidth: '20px', minHeight: '20px' }}
          >
            <Info className="w-4 h-4" />
          </button>
          {showTooltip && createPortal(renderCustomTooltip(), tooltipContainer)}
        </div>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleClick}
              className="inline-flex items-center justify-center w-5 h-5 rounded-full hover:bg-blue-100 text-blue-600 hover:text-blue-700 transition-colors border border-blue-200 bg-blue-50 flex-shrink-0"
              aria-label="Column creation info"
              style={{ minWidth: '20px', minHeight: '20px' }}
            >
              <Info className="w-4 h-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent 
            className="max-w-xs"
            side="top"
            sideOffset={4}
          >
            <p className="text-sm font-medium">Click to see how this column was created</p>
            <p className="text-xs mt-1 text-gray-600">{metadata.formula}</p>
          </TooltipContent>
        </Tooltip>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Info className="w-5 h-5 text-blue-600" />
              Column Creation Details
            </DialogTitle>
            <DialogDescription>
              Information about how this column was created via metric operations
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 mt-4">
            {/* Formula */}
            <div>
              <label className="text-sm font-semibold text-gray-700">Formula:</label>
              <div className="mt-1 p-2 bg-blue-50 rounded border border-blue-200">
                <code className="text-sm text-blue-900">{metadata.formula}</code>
              </div>
            </div>

            {/* Operation Type */}
            {metadata.operation_type && (
              <div>
                <label className="text-sm font-semibold text-gray-700">Operation Type:</label>
                <div className="mt-1">
                  <Badge variant="outline" className="text-sm">
                    {metadata.operation_type}
                  </Badge>
                </div>
              </div>
            )}

            {/* Input Columns */}
            {metadata.input_columns && metadata.input_columns.length > 0 && (
              <div>
                <label className="text-sm font-semibold text-gray-700">Input Columns:</label>
                <div className="mt-1 flex flex-wrap gap-1">
                  {metadata.input_columns.map((col, idx) => (
                    <Badge key={idx} variant="secondary" className="text-xs">
                      {col}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Parameters */}
            {metadata.parameters && Object.keys(metadata.parameters).length > 0 && (
              <div>
                <label className="text-sm font-semibold text-gray-700">Parameters:</label>
                <div className="mt-1 p-2 bg-gray-50 rounded border">
                  <div className="space-y-1">
                    {Object.entries(metadata.parameters).map(([key, value]) => (
                      <div key={key} className="text-sm">
                        <span className="font-medium text-gray-700">{key}:</span>{' '}
                        <span className="text-gray-600">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

