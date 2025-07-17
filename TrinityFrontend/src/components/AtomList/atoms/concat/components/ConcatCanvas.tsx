import React, { useEffect, useState } from 'react';
import { CONCAT_API } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Database, ArrowDown } from 'lucide-react';

interface ConcatCanvasProps {
  concatId?: string;
  resultFilePath?: string;
  file1?: string;
  file2?: string;
  direction?: string;
}

interface PaginationInfo {
  current_page: number;
  page_size: number;
  total_rows: number;
  total_pages: number;
  start_row: number;
  end_row: number;
}

interface DataResponse {
  data: string;
  pagination: PaginationInfo;
}

const ConcatCanvas: React.FC<ConcatCanvasProps> = ({ concatId, resultFilePath, file1, file2, direction }) => {
  const [data, setData] = useState<Record<string, any>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [rawCSV, setRawCSV] = useState<string>('');
  const [isSaved, setIsSaved] = useState(!!resultFilePath);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const parseCSV = (csvText: string): { headers: string[]; rows: Record<string, any>[] } => {
    const lines = csvText.split(/\r?\n/).filter(line => line.trim());
    if (lines.length === 0) return { headers: [], rows: [] };

    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const numeric = /^-?\d+(?:\.\d+)?$/;
    const rows = lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
      const row: Record<string, any> = {};
      headers.forEach((h, i) => {
        const value = values[i] ?? '';
        row[h] = numeric.test(value) ? parseFloat(value) : value;
      });
      return row;
    });
    return { headers, rows };
  };

  const fetchData = async (page: number = 1) => {
    if (!resultFilePath) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // console.log(`[ConcatCanvas] Fetching: ${CONCAT_API}/cached_dataframe?object_name=${encodeURIComponent(resultFilePath)}&page=${page}&page_size=25`);
      const response = await fetch(
        `${CONCAT_API}/cached_dataframe?object_name=${encodeURIComponent(resultFilePath)}&page=${page}&page_size=20`
      );
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result: DataResponse = await response.json();
      console.log('[ConcatCanvas] Data fetch result:', result);
      setRawCSV(result.data);
      const { headers, rows } = parseCSV(result.data);
      console.log('[ConcatCanvas] Parsed headers:', headers);
      console.log('[ConcatCanvas] Parsed rows count:', rows.length);
      console.log('[ConcatCanvas] First few rows:', rows.slice(0, 3));
      
      setData(rows);
      setHeaders(headers);
      setPagination(result.pagination);
      setCurrentPage(page);
      setIsSaved(true);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    console.log('[ConcatCanvas] resultFilePath:', resultFilePath);
    if (resultFilePath) {
      fetchData(1);
    } else {
      setIsSaved(false);
    }
  }, [resultFilePath]);

  const handlePageChange = (page: number) => {
    fetchData(page);
  };

  // Save DataFrame handler
  const handleSaveDataFrame = async () => {
    setSaveLoading(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      // Use the current rawCSV, and generate a filename
      const filename = `concat_${file1?.split('/').pop() || 'file1'}_${file2?.split('/').pop() || 'file2'}_${Date.now()}`;
      const response = await fetch(`${CONCAT_API}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv_data: rawCSV, filename }),
      });
      if (!response.ok) {
        throw new Error(`Save failed: ${response.statusText}`);
      }
      const result = await response.json();
      setSaveSuccess(true);
      setIsSaved(true);
      // Refetch data from the saved file
      if (result.result_file) {
        fetchData(1);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save DataFrame');
    } finally {
      setSaveLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading data...</span>
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

  if (!resultFilePath) {
    return (
      <div className="p-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-gray-500">No concatenation results available. Perform a concatenation to see results here.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Always render the configuration section
  return (
    <div className="w-full h-full p-6 bg-gradient-to-br from-slate-50 to-blue-50 overflow-y-auto">
      {/* Current Selection (Configuration) */}
      <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm mb-6 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-1">
          <div className="bg-white rounded-sm">
            <div className="p-6">
              <div className="flex items-center mb-4">
                <div className="w-1 h-8 bg-gradient-to-b from-blue-500 to-blue-600 rounded-full mr-4"></div>
                <h3 className="text-xl font-bold text-gray-900">Current Selection</h3>
              </div>
              <div className="grid grid-cols-3 gap-6">
                <div>
                  <div className="flex items-center mb-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
                    <span className="font-medium text-gray-700">Primary Source</span>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <div className="flex items-center space-x-2">
                      <Database className="w-4 h-4 text-blue-600" />
                      <span className="text-sm font-medium text-gray-800">{file1 ? file1.split('/').pop() : 'N/A'}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <div className="flex items-center mb-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                    <span className="font-medium text-gray-700">Secondary Source</span>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <div className="flex items-center space-x-2">
                      <Database className="w-4 h-4 text-green-600" />
                      <span className="text-sm font-medium text-gray-800">{file2 ? file2.split('/').pop() : 'N/A'}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <div className="flex items-center mb-2">
                    <div className="w-2 h-2 bg-purple-500 rounded-full mr-2"></div>
                    <span className="font-medium text-gray-700">Strategy</span>
                  </div>
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                    <div className="flex items-center space-x-2">
                      <ArrowDown className="w-4 h-4 text-purple-600" />
                      <span className="text-sm font-medium text-gray-800 capitalize">{direction || 'N/A'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Concat Results */}
      <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm overflow-hidden">
        <div className="bg-gradient-to-r from-green-500 to-green-600 p-1">
          <div className="bg-white rounded-sm">
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center">
                  <div className="w-1 h-8 bg-gradient-to-b from-green-500 to-green-600 rounded-full mr-4"></div>
                  <h3 className="text-xl font-bold text-gray-900">Concat Results</h3>
                  {headers.length > 0 && data.length > 0 && (
                    <Badge variant="outline" className="bg-green-50 border-green-200 text-green-700 ml-3">
                      {data.length.toLocaleString()} rows • {headers.length} columns
                    </Badge>
                  )}
                </div>
                {headers.length > 0 && data.length > 0 && (
                  <div className="flex items-center">
                    <Button
                      onClick={handleSaveDataFrame}
                      disabled={saveLoading}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      {saveLoading ? 'Saving...' : 'Save DataFrame'}
                    </Button>
                    {saveError && <span className="text-red-600 text-sm ml-2">{saveError}</span>}
                    {saveSuccess && <span className="text-green-600 text-sm ml-2">Saved!</span>}
                  </div>
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
                          className={`
                            ${rowIndex < 4
                              ? 'bg-yellow-50 hover:bg-yellow-100'
                              : 'bg-white hover:bg-gray-50'
                            }
                            transition-all duration-200 border-b border-gray-100
                          `}
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

export default ConcatCanvas;