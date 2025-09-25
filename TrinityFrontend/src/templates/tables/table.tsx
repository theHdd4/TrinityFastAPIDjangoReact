import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import './table.css';

interface TableProps {
  headers: React.ReactNode[];
  colClasses?: string[];
  children: React.ReactNode;
  bodyClassName?: string;
  minimizable?: boolean;
  defaultMinimized?: boolean;
  onMinimizeToggle?: (minimized: boolean) => void;
  customHeader?: {
    title: string;
    subtitle?: string;
    subtitleClickable?: boolean;
    onSubtitleClick?: () => void;
    controls?: React.ReactNode;
  };
  borderColor?: string;
}

const Table: React.FC<TableProps> = ({
  headers,
  colClasses = [],
  children,
  bodyClassName = '',
  minimizable = true,
  defaultMinimized = false,
  onMinimizeToggle,
  customHeader,
  borderColor = 'border-green-500',
}) => {
  const [isMinimized, setIsMinimized] = useState(defaultMinimized);

  const handleMinimizeToggle = () => {
    const newMinimizedState = !isMinimized;
    setIsMinimized(newMinimizedState);
    onMinimizeToggle?.(newMinimizedState);
  };
  return (
    <div className={`table-wrapper rounded-2xl border-2 bg-white shadow-sm ${borderColor.replace('border-', 'border-').replace('-500', '-200')}`}>
      {customHeader && (
        <div className="table-custom-header">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
            <div className="flex items-center">
              <div className={`w-1 h-8 ${borderColor.replace('border-', 'bg-')} rounded-full mr-4`}></div>
              <div>
                <h2 className="text-base font-semibold text-slate-800">{customHeader.title}</h2>
                {customHeader.subtitle && (
                  <p 
                    className={`text-sm mt-1 ${customHeader.subtitleClickable ? 'text-blue-500 cursor-pointer hover:text-blue-700 hover:underline' : 'text-slate-500'}`}
                    onClick={customHeader.subtitleClickable ? customHeader.onSubtitleClick : undefined}
                  >
                    {customHeader.subtitle}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {customHeader.controls}
              {minimizable && (
                <button
                  onClick={handleMinimizeToggle}
                  className="table-minimize-button"
                  aria-label={isMinimized ? 'Expand table' : 'Minimize table'}
                  title={isMinimized ? 'Expand table' : 'Minimize table'}
                >
                  {isMinimized ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronUp className="w-4 h-4" />
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      <div className="table-edge-left" />
      <div className="table-edge-right" />
      <div className={`table-overflow ${bodyClassName} ${isMinimized ? 'table-minimized' : ''} rounded-md border ${borderColor.replace('border-', 'border-').replace('-500', '-100')}`}>
        <table className="table-base">
          {colClasses.length > 0 && (
            <colgroup>
              {colClasses.map((cls, idx) => (
                <col key={idx} className={cls} />
              ))}
            </colgroup>
          )}
          {!isMinimized && (
            <thead className="table-header">
              <tr className="table-header-row">
                {headers.map((h, i) => (
                  <th key={i} className="table-header-cell">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          {!isMinimized && <tbody>{children}</tbody>}
        </table>
      </div>
    </div>
  );
};

export default Table;
