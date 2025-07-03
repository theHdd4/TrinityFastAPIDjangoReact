import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FEATURE_OVERVIEW_API } from '@/lib/api';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const DataFrameView = () => {
  const [params] = useSearchParams();
  const name = params.get('name') || '';
  const [rows, setRows] = useState<string[][]>([]);

  useEffect(() => {
    if (!name) return;
    fetch(`${FEATURE_OVERVIEW_API}/cached_dataframe?object_name=${encodeURIComponent(name)}`)
      .then(res => res.text())
      .then(text => {
        const lines = text.trim().split(/\r?\n/);
        const parsed = lines.map(l => l.split(','));
        setRows(parsed);
      })
      .catch(() => setRows([]));
  }, [name]);

  if (!name) return <div className="p-4">No dataframe specified</div>;

  return (
    <div className="p-4">
      <h1 className="text-lg font-semibold mb-4 break-all">{name.split('/').pop()}</h1>
      <div className="overflow-x-auto overflow-y-auto max-h-[80vh]">
        <Table className="min-w-max">
          <TableHeader>
            <TableRow>
              {rows[0]?.map((h, i) => (
                <TableHead key={i}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(1).map((r, i) => (
              <TableRow key={i}>
                {r.map((c, j) => (
                  <TableCell key={j}>{c}</TableCell>
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
