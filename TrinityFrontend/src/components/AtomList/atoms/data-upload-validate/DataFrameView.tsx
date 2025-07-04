import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FEATURE_OVERVIEW_API } from '@/lib/api';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';

const DataFrameView = () => {
  const [params] = useSearchParams();
  const name = params.get('name') || '';
  const [data, setData] = useState<Record<string, string>[]>([]);
  const [columns, setColumns] = useState<ColumnDef<Record<string, string>>[]>([]);

  useEffect(() => {
    if (!name) return;
    fetch(`${FEATURE_OVERVIEW_API}/cached_dataframe?object_name=${encodeURIComponent(name)}`)
      .then(res => res.text())
      .then(text => {
        const lines = text.trim().split(/\r?\n/);
        const header = lines[0]?.split(',') || [];
        const rows = lines.slice(1);
        const objects = rows.map(line => {
          const vals = line.split(',');
          const obj: Record<string, string> = {};
          header.forEach((h, i) => {
            obj[h] = vals[i] || '';
          });
          return obj;
        });
        setColumns(header.map(h => ({ accessorKey: h, header: h })));
        setData(objects);
      })
      .catch(() => {
        setColumns([]);
        setData([]);
      });
  }, [name]);

  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });

  if (!name) return <div className="p-4">No dataframe specified</div>;

  return (
    <div className="p-4">
      <h1 className="text-lg font-semibold mb-4 break-all">{name.split('/').pop()}</h1>
      <div
        className="overflow-x-auto overflow-y-auto max-h-[80vh] scrollbar-thin scrollbar-thumb-gray-300"
        style={{ transform: 'rotateX(180deg)' }}
      >
        <Table className="min-w-max" style={{ transform: 'rotateX(180deg)' }}>
          <TableHeader>
            {table.getHeaderGroups().map(headerGroup => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <TableHead key={header.id}>
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map(row => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map(cell => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default DataFrameView;
