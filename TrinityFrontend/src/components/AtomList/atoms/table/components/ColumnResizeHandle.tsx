import React from 'react';

interface ColumnResizeHandleProps {
  column: string;
  onResizeStart: (column: string, startX: number, startWidth: number) => void;
}

const ColumnResizeHandle: React.FC<ColumnResizeHandleProps> = ({
  column,
  onResizeStart,
}) => {
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const parentElement = e.currentTarget.parentElement as HTMLElement;
    const currentWidth = parentElement?.offsetWidth || 150;
    onResizeStart(column, e.clientX, currentWidth);
  };
  
  return (
    <div
      className="absolute top-0 right-0 h-full w-1 cursor-col-resize bg-blue-300 opacity-0 hover:opacity-100 transition-opacity duration-150 z-20"
      onMouseDown={handleMouseDown}
      title="Drag to resize column"
      style={{
        zIndex: 20,
      }}
    />
  );
};

export default ColumnResizeHandle;



