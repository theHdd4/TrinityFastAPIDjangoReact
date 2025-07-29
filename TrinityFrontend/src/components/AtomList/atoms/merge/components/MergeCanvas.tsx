import React, { useEffect, useState } from 'react';
import { MERGE_API } from '@/lib/api';
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
import { Loader2, Database, GitMerge } from 'lucide-react';

interface MergeCanvasProps {
  mergeId?: string;
  resultFilePath?: string;
  file1?: string;
  file2?: string;
  joinColumns?: string[];
  joinType?: string;
  unsavedData?: string; // Add support for unsaved data
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

const MergeCanvas: React.FC<MergeCanvasProps> = ({ 
  mergeId, 
  resultFilePath, 
  file1, 
  file2, 
  joinColumns = [], 
  joinType = 'inner',
  unsavedData
}) => {
  console.log('🔧 MergeCanvas: Props received:', { 
    mergeId, 
    resultFilePath, 
    file1, 
    file2, 
    joinColumns, 
    joinType,
    unsavedData: unsavedData ? 'present' : 'not present'
  });

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
    console.log('[MergeCanvas] fetchData called with page:', page);
    console.log('[MergeCanvas] resultFilePath in fetchData:', resultFilePath);
    console.log('[MergeCanvas] unsavedData in fetchData:', unsavedData ? 'present' : 'not present');
    
    if (!resultFilePath && !unsavedData) {
      console.log('[MergeCanvas] No resultFilePath or unsavedData, returning early');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      let csvData: string;
      
      if (unsavedData) {
        // Use unsaved data directly
        console.log('[MergeCanvas] Using unsaved data');
        csvData = unsavedData;
        setIsSaved(false);
        
        // Parse all data and implement client-side pagination
        const { headers, rows } = parseCSV(csvData);
        const pageSize = 20;
        const totalRows = rows.length;
        const totalPages = Math.ceil(totalRows / pageSize);
        const startRow = (page - 1) * pageSize;
        const endRow = Math.min(startRow + pageSize, totalRows);
        
        // Get current page data
        const currentPageData = rows.slice(startRow, endRow);
        
        // Set pagination info
        setPagination({
          current_page: page,
          page_size: pageSize,
          total_rows: totalRows,
          total_pages: totalPages,
          start_row: startRow + 1,
          end_row: endRow
        });
        setCurrentPage(page);
        
        setData(currentPageData);
        setHeaders(headers);
        setRawCSV(csvData);
        
      } else if (resultFilePath) {
        // Fetch from saved file
        const url = `${MERGE_API}/cached_dataframe?object_name=${encodeURIComponent(resultFilePath)}&page=${page}&page_size=20`;
        console.log('[MergeCanvas] Making request to:', url);
        
        const response = await fetch(url);
        
        console.log('[MergeCanvas] Response status:', response.status);
        console.log('[MergeCanvas] Response ok:', response.ok);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('[MergeCanvas] Error response:', errorText);
          throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
        }
        
        const result: DataResponse = await response.json();
        console.log('[MergeCanvas] Data fetch result:', result);
        csvData = result.data;
        setPagination(result.pagination);
        setCurrentPage(page);
        setIsSaved(true);
        
        const { headers, rows } = parseCSV(csvData);
        setData(rows);
        setHeaders(headers);
        setRawCSV(csvData);
        
      } else {
        throw new Error('No data available');
      }
      
    } catch (err) {
      console.error('[MergeCanvas] Error fetching data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    console.log('[MergeCanvas] resultFilePath:', resultFilePath);
    console.log('[MergeCanvas] resultFilePath type:', typeof resultFilePath);
    console.log('[MergeCanvas] resultFilePath truthy:', !!resultFilePath);
    console.log('[MergeCanvas] unsavedData present:', !!unsavedData);
    
    if (resultFilePath || unsavedData) {
      console.log('[MergeCanvas] Fetching data for resultFilePath or unsavedData');
      fetchData(1);
    } else {
      console.log('[MergeCanvas] No resultFilePath or unsavedData, setting isSaved to false');
      setIsSaved(false);
    }
  }, [resultFilePath, unsavedData]);

  const handlePageChange = (page: number) => {
    // Now pagination works for both saved and unsaved data
    fetchData(page);
  };

  // Save DataFrame handler
  const handleSaveDataFrame = async () => {
    setSaveLoading(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const filename = `merge_${file1?.split('/').pop() || 'file1'}_${file2?.split('/').pop() || 'file2'}_${Date.now()}`;
      const response = await fetch(`${MERGE_API}/save`, {
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
      console.log('[MergeCanvas] Save successful:', result);
      // Update the settings to reflect the saved file
      // This would need to be handled by the parent component
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

  if (!resultFilePath && !unsavedData) {
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
              <div className="grid grid-cols-4 gap-6">
                <div>
                  <div className="flex items-center mb-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
                    <span className="font-medium text-gray-700">Primary Source</span>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <div className="flex items-center space-x-2">
                      <Database className="w-4 h-4 text-blue-600 flex-shrink-0" />
                      <span className="text-sm font-medium text-gray-800 truncate" title={file1 ? file1.split('/').pop() : 'N/A'}>
                        {file1 ? file1.split('/').pop() : 'N/A'}
                      </span>
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
                      <Database className="w-4 h-4 text-green-600 flex-shrink-0" />
                      <span className="text-sm font-medium text-gray-800 truncate" title={file2 ? file2.split('/').pop() : 'N/A'}>
                        {file2 ? file2.split('/').pop() : 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>
                <div>
                  <div className="flex items-center mb-2">
                    <div className="w-2 h-2 bg-purple-500 rounded-full mr-2"></div>
                    <span className="font-medium text-gray-700">Join Type</span>
                  </div>
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                    <div className="flex items-center space-x-2">
                      <GitMerge className="w-4 h-4 text-purple-600" />
                      <span className="text-sm font-medium text-gray-800 capitalize">{joinType || 'N/A'}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <div className="flex items-center mb-2">
                    <div className="w-2 h-2 bg-orange-500 rounded-full mr-2"></div>
                    <span className="font-medium text-gray-700">Join Columns</span>
                  </div>
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                    <div className="flex items-center space-x-2">
                      <GitMerge className="w-4 h-4 text-orange-600" />
                      <span className="text-sm font-medium text-gray-800">{joinColumns.length} column(s)</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Merge Results */}
      <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm overflow-hidden">
        <div className="bg-gradient-to-r from-green-500 to-green-600 p-1">
          <div className="bg-white rounded-sm">
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center">
                  <div className="w-1 h-8 bg-gradient-to-b from-green-500 to-green-600 rounded-full mr-4"></div>
                  <h3 className="text-xl font-bold text-gray-900">Merge Results</h3>
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
                      className="bg-green-600 hover:bg-green-700 text-white"
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
                      <TableRow className="bg-gradient-to-r from-gray-50 to-purple-50 border-b-2 border-purple-100">
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

export default MergeCanvas; 