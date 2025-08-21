import React from 'react';
import './table.css';

interface TableProps {
  headers: React.ReactNode[];
  colClasses?: string[];
  children: React.ReactNode;
}

const Table: React.FC<TableProps> = ({ headers, colClasses = [], children }) => {
  return (
    <div className="table-wrapper">
      <div className="table-edge-left" />
      <div className="table-edge-right" />
      <div className="table-overflow">
        <table className="table-base">
          {colClasses.length > 0 && (
            <colgroup>
              {colClasses.map((cls, idx) => (
                <col key={idx} className={cls} />
              ))}
            </colgroup>
          )}
          <thead className="table-header">
            <tr className="table-header-row">
              {headers.map((h, i) => (
                <th key={i} className="table-header-cell">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
};

export default Table;
