import React, {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
  Profiler,
} from 'react';
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
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  SortingState,
  ColumnFiltersState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { csvParse } from 'd3';

const PAGE_SIZE = 5000;

const DataFrameView = () => {
  const [params] = useSearchParams();
  const name = params.get('name') || '';
  const [data, setData] = useState<Record<string, string>[]>([]);
  const [columns, setColumns] = useState<ColumnDef<Record<string, string>>[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [page, setPage] = useState(0);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const fetchPage = useCallback(
    async (pg: number) => {
      if (!name) return;
      const search = new URLSearchParams({
        object_name: name,
        offset: String(pg * PAGE_SIZE),
        limit: String(PAGE_SIZE),
      });
      const res = await fetch(
        `${FEATURE_OVERVIEW_API}/cached_dataframe?${search.toString()}`,
        { credentials: 'include' }
      );
      const text = await res.text();
      const total = parseInt(res.headers.get('x-total-count') || '0');
      const parsed = csvParse(text);
      const header = parsed.columns;
      const objects = parsed.map(d => d as Record<string, string>);
      setColumns(
        header.map(h => ({
          accessorKey: h,
          header: h,
          cell: info => info.getValue(),
        }))
      );
      setData(objects);
      setRowCount(total || objects.length);
    },
    [name]
  );

  useEffect(() => {
    fetchPage(page);
  }, [page, fetchPage]);

  const memoColumns = useMemo(() => columns, [columns]);
  const memoData = useMemo(() => data, [data]);


  const table = useReactTable({
    data: memoData,
    columns: memoColumns,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    manualPagination: rowCount > PAGE_SIZE,
    pageCount: rowCount > PAGE_SIZE ? Math.ceil(rowCount / PAGE_SIZE) : undefined,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const rowVirtualizer = useVirtualizer({
    count: table.getRowModel().rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 35,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  const Cell = React.memo(({ cell }: { cell: any }) => (
    <TableCell>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
  ));

  if (!name) return <div className="p-4">No dataframe specified</div>;

  return (
    <div className="p-4">
      <h1 className="text-lg font-semibold mb-2 break-all">{name.split('/').pop()}</h1>
      {rowCount > PAGE_SIZE && (
        <div className="mb-2 flex items-center gap-2">
          <button
            className="px-2 py-1 border rounded"
            disabled={page === 0}
            onClick={() => setPage(p => Math.max(0, p - 1))}
          >
            Prev
          </button>
          <span className="text-sm">
            Page {page + 1} / {Math.ceil(rowCount / PAGE_SIZE)}
          </span>
          <button
            className="px-2 py-1 border rounded"
            disabled={(page + 1) * PAGE_SIZE >= rowCount}
            onClick={() => setPage(p => p + 1)}
          >
            Next
          </button>
        </div>
      )}
      <div
        ref={tableContainerRef}
        className="overflow-x-auto overflow-y-auto max-h-[80vh] scrollbar-thin scrollbar-thumb-gray-300"
        style={{ transform: 'rotateX(180deg)' }}
      >
        <Profiler id="dataframe-table" onRender={() => {}}>
          <Table className="min-w-max" style={{ transform: 'rotateX(180deg)' }}>
            <TableHeader>
              {table.getHeaderGroups().map(headerGroup => (
                <React.Fragment key={headerGroup.id}>
                  <TableRow>
                  {headerGroup.headers.map(header => (
                    <TableHead
                      key={header.id}
                      onClick={header.column.getToggleSortingHandler()}
                      className="cursor-pointer select-none"
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                      {header.column.getIsSorted() === 'asc'
                        ? ' \u25B2'
                        : header.column.getIsSorted() === 'desc'
                        ? ' \u25BC'
                        : ''}
                    </TableHead>
                  ))}
                </TableRow>
                <TableRow>
                  {headerGroup.headers.map(header => (
                    <TableHead key={header.id}>
                      {header.column.getCanFilter() ? (
                        <input
                          className="w-full rounded border px-1 py-0.5"
                          value={(header.column.getFilterValue() as string) ?? ''}
                          onChange={e => header.column.setFilterValue(e.target.value)}
                          placeholder="Filter"
                        />
                      ) : null}
                    </TableHead>
                  ))}
                </TableRow>
              </React.Fragment>
              ))}
            </TableHeader>
            <TableBody style={{ height: `${totalSize}px`, position: 'relative' }}>
              {virtualRows.map(virtualRow => {
                const row = table.getRowModel().rows[virtualRow.index];
                return (
                  <TableRow
                    key={row.id}
                    data-index={virtualRow.index}
                    style={{
                      position: 'absolute',
                      top: 0,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    {row.getVisibleCells().map(cell => (
                      <Cell key={cell.id} cell={cell} />
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Profiler>
      </div>
    </div>
  );
};

export default DataFrameView;
