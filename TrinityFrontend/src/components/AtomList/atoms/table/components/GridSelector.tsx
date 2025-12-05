import React, { useState } from 'react';

interface GridSelectorProps {
  onSelect: (rows: number, columns: number) => void;
  selectedRows?: number;
  selectedCols?: number;
}

const GridSelector: React.FC<GridSelectorProps> = ({
  onSelect,
  selectedRows = 5,
  selectedCols = 5
}) => {
  const [hoveredCell, setHoveredCell] = useState<{row: number, col: number} | null>(null);
  const [selectedCell, setSelectedCell] = useState<{row: number, col: number}>({
    row: selectedRows,
    col: selectedCols
  });

  const handleCellClick = (row: number, col: number) => {
    setSelectedCell({ row, col });
    onSelect(row, col);
  };

  const handleCellHover = (row: number, col: number) => {
    setHoveredCell({ row, col });
  };

  const isCellSelected = (rowIdx: number, colIdx: number) => {
    return rowIdx < selectedCell.row && colIdx < selectedCell.col;
  };

  const isCellHovered = (rowIdx: number, colIdx: number) => {
    if (!hoveredCell) return false;
    return rowIdx < hoveredCell.row && colIdx < hoveredCell.col;
  };

  return (
    <div className="inline-block border-2 border-gray-300 p-3 bg-gray-50 rounded-lg shadow-sm">
      <table className="border-collapse">
        {/* Column Headers */}
        <thead>
          <tr>
            <th className="w-6 h-6"></th>
            {Array.from({ length: 10 }, (_, i) => (
              <th
                key={i}
                className="w-7 h-6 text-xs font-semibold text-gray-600 text-center"
              >
                {i + 1}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {Array.from({ length: 10 }, (_, rowIdx) => (
            <tr key={rowIdx}>
              {/* Row Header */}
              <td className="w-6 h-7 text-xs font-semibold text-gray-600 text-right pr-2">
                {rowIdx + 1}
              </td>

              {/* Grid Cells */}
              {Array.from({ length: 10 }, (_, colIdx) => {
                const isSelected = isCellSelected(rowIdx, colIdx);
                const isHovered = isCellHovered(rowIdx, colIdx);

                return (
                  <td
                    key={colIdx}
                    className={`
                      w-7 h-7 border border-gray-300 cursor-pointer transition-all duration-100
                      ${isSelected
                        ? 'bg-teal-500 border-teal-600 shadow-sm'
                        : isHovered
                        ? 'bg-teal-200 border-teal-300'
                        : 'bg-white hover:bg-teal-50'
                      }
                    `}
                    onClick={() => handleCellClick(rowIdx + 1, colIdx + 1)}
                    onMouseEnter={() => handleCellHover(rowIdx + 1, colIdx + 1)}
                    onMouseLeave={() => setHoveredCell(null)}
                    title={`${rowIdx + 1} × ${colIdx + 1}`}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Selection Info */}
      <div className="mt-3 text-center">
        <p className="text-xs text-gray-600">
          {hoveredCell ? (
            <span className="text-teal-600 font-medium">
              Hover: {hoveredCell.row} × {hoveredCell.col}
            </span>
          ) : (
            <span className="text-gray-500">
              Click to select dimensions
            </span>
          )}
        </p>
      </div>
    </div>
  );
};

export default GridSelector;



