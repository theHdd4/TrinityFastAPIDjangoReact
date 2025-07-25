import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Loader2 } from 'lucide-react';

interface MergeResultsProps {
  settings: any;
}

interface PaginationInfo {
  current_page: number;
  page_size: number;
  total_rows: number;
  total_pages: number;
  start_row: number;
  end_row: number;
}

const MergeResults: React.FC<MergeResultsProps> = ({ settings }) => {
  const [data, setData] = useState<Record<string, any>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const parseCSV = (csvText: string): { headers: string[]; rows: Record<string, any>[] } => {
    const lines = csvText.split(/\r?\n/).filter(line => line.trim());
    if (lines.length === 0) return { headers: [], rows: [] };
    
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const rows = lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
      const row: Record<string, any> = {};
      headers.forEach((h, i) => {
        const value = values[i] || '';
        const num = parseFloat(value);
        row[h] = !isNaN(num) && value !== '' ? num : value;
      });
      return row;
    });
    return { headers, rows };
  };

  useEffect(() => {
    if (settings.mergeResults && settings.mergeResults.data) {
      const { headers, rows } = parseCSV(settings.mergeResults.data);
      setHeaders(headers);
      setData(rows);
      
      // Create pagination info
      const totalRows = rows.length;
      const pageSize = 20;
      const totalPages = Math.ceil(totalRows / pageSize);
      
      setPagination({
        current_page: 1,
        page_size: pageSize,
        total_rows: totalRows,
        total_pages: totalPages,
        start_row: 1,
        end_row: Math.min(pageSize, totalRows)
      });
      
      setCurrentPage(1);
      setError(null);
    }
  }, [settings.mergeResults]);

  const handlePageChange = (page: number) => {
    if (!settings.mergeResults?.data) return;
    
    const { headers, rows } = parseCSV(settings.mergeResults.data);
    const pageSize = 20;
    const startIdx = (page - 1) * pageSize;
    const endIdx = startIdx + pageSize;
    const pageData = rows.slice(startIdx, endIdx);
    
    setData(pageData);
    setHeaders(headers);
    setCurrentPage(page);
    
    const totalRows = rows.length;
    const totalPages = Math.ceil(totalRows / pageSize);
    
    setPagination({
      current_page: page,
      page_size: pageSize,
      total_rows: totalRows,
      total_pages: totalPages,
      start_row: startIdx + 1,
      end_row: Math.min(endIdx, totalRows)
    });
  };

  if (!settings.mergeResults || !settings.mergeResults.data) {
    return (
      <div className="p-4">
              <Card>
        <CardContent className="p-4">
          <p className="text-gray-500">Please Configure merge options</p>
        </CardContent>
      </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading results...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4">
            <p className="text-red-800">Error: {error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full h-full p-6 bg-gradient-to-br from-slate-50 to-blue-50 overflow-y-auto">
      {/* Merge Results */}
      <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm overflow-hidden">
        <div className="bg-gradient-to-r from-green-500 to-green-600 p-1">
          <div className="bg-white rounded-sm">
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center">
                  <div className="w-1 h-8 bg-gradient-to-b from-green-500 to-green-600 rounded-full mr-4"></div>
                  <h3 className="text-xl font-bold text-gray-900">Merge Results</h3>
                </div>
                {headers.length > 0 && data.length > 0 && (
                  <Badge variant="outline" className="bg-green-50 border-green-200 text-green-700">
                    {settings.mergeResults.row_count?.toLocaleString() || data.length.toLocaleString()} rows • {headers.length} columns
                  </Badge>
                )}
              </div>
              <div className="overflow-auto">
                {headers.length === 0 || data.length === 0 ? (
                  <div className="p-4 text-center text-gray-500">No results to display.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gradient-to-r from-gray-50 to-green-50 border-b-2 border-green-100">
                        {headers.map((header, index) => (
                          <TableHead key={index} className="font-bold text-gray-800 text-center py-4">{header}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.map((row, rowIndex) => (
                        <TableRow
                          key={rowIndex}
                          className="bg-white hover:bg-gray-50 transition-all duration-200 border-b border-gray-100"
                        >
                          {headers.map((header, colIndex) => (
                            <TableCell key={colIndex} className="py-4 text-center font-medium text-gray-700">
                              {row[header] !== null && row[header] !== undefined && row[header] !== '' ? (
                                typeof row[header] === 'number' ? row[header] : String(row[header])
                              ) : (
                                <Badge variant="outline" className="text-gray-500">null</Badge>
                              )}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Pagination */}
      {pagination && pagination.total_pages > 1 && (
        <Card className="mt-4">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">
                Page {pagination.current_page} of {pagination.total_pages}
              </div>
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => handlePageChange(Math.max(1, pagination.current_page - 1))}
                      className={pagination.current_page === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                  </PaginationItem>
                  {Array.from({ length: Math.min(5, pagination.total_pages) }, (_, i) => {
                    let pageNum;
                    if (pagination.total_pages <= 5) {
                      pageNum = i + 1;
                    } else if (pagination.current_page <= 3) {
                      pageNum = i + 1;
                    } else if (pagination.current_page >= pagination.total_pages - 2) {
                      pageNum = pagination.total_pages - 4 + i;
                    } else {
                      pageNum = pagination.current_page - 2 + i;
                    }
                    return (
                      <PaginationItem key={pageNum}>
                        <PaginationLink
                          onClick={() => handlePageChange(pageNum)}
                          isActive={pagination.current_page === pageNum}
                          className="cursor-pointer"
                        >
                          {pageNum}
                        </PaginationLink>
                      </PaginationItem>
                    );
                  })}
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => handlePageChange(Math.min(pagination.total_pages, pagination.current_page + 1))}
                      className={pagination.current_page === pagination.total_pages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default MergeResults; 