import React from 'react';

interface RowResizeHandleProps {
  rowIndex: number;
  onResizeStart: (rowIndex: number, startY: number, startHeight: number) => void;
}

const RowResizeHandle: React.FC<RowResizeHandleProps> = ({
  rowIndex,
  onResizeStart,
}) => {
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const rowElement = e.currentTarget.parentElement?.parentElement as HTMLElement;
    const currentHeight = rowElement?.offsetHeight || 24;
    onResizeStart(rowIndex, e.clientY, currentHeight);
  };
  
  return (
    <div
      className="absolute bottom-0 left-0 w-full h-1 cursor-row-resize bg-blue-300 opacity-0 hover:opacity-100 transition-opacity duration-150 z-20"
      onMouseDown={handleMouseDown}
      title="Drag to resize row"
      style={{
        zIndex: 20,
      }}
    />
  );
};

export default RowResizeHandle;

