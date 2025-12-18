import React, { useEffect, useState, useMemo } from 'react';
import { VALIDATE_API } from '@/lib/api';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { CONCAT_API } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Table as UITable,
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
import { Loader2, Database, ArrowDown, ArrowRight, ArrowUp, FilterIcon, Plus } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import Table from '@/templates/tables/table';
import { DataSummaryView } from '@/components/shared/DataSummaryView';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SingleSelectDropdown } from '@/templates/dropdown';

interface ConcatCanvasProps {
  atomId: string;
  concatId?: string;
  resultFilePath?: string;
  file1?: string;
  file2?: string;
  direction?: string;
  fullCsv?: string;
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

interface Frame { object_name: string; csv_name: string; }

const ConcatCanvas: React.FC<ConcatCanvasProps> = ({ atomId, concatId, resultFilePath, file1, file2, direction, fullCsv }) => {
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const [frames, setFrames] = useState<Frame[]>([]);
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
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveFileName, setSaveFileName] = useState('');
  
  // Sorting and filtering state
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});

  // Tab state for switching between primary and secondary file data summary
  const [activeCardinalityTab, setActiveCardinalityTab] = useState<'primary' | 'secondary'>('primary');
  
  // Get atom settings to check showDataSummary
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const settings = (atom?.settings as any) || {};

  // Sorting and filtering functions
  const handleSort = (column: string, direction: 'asc' | 'desc') => {
    setSortColumn(column);
    setSortDirection(direction);
  };

  const handleColumnFilter = (column: string, values: string[]) => {
    setColumnFilters(prev => ({
      ...prev,
      [column]: values
    }));
  };

  const clearColumnFilter = (column: string) => {
    setColumnFilters(prev => {
      const newFilters = { ...prev };
      delete newFilters[column];
      return newFilters;
    });
  };

  // Legacy displayedCardinality useMemo removed - now using DataSummaryView

  const getUniqueColumnValues = (column: string): string[] => {
    if (!rawCSV) return [];
    
    const lines = rawCSV.split(/\r?\n/).filter(line => line.trim());
    if (lines.length <= 1) return [];
    
    const csvHeaders = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const numeric = /^-?\d+(?:\.\d+)?$/;
    
    // Parse all data
    let allData = lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
      const row: Record<string, any> = {};
      csvHeaders.forEach((h, i) => {
        const value = values[i] ?? '';
        row[h] = numeric.test(value) ? parseFloat(value) : value;
      });
      return row;
    });
    
    // Apply all other column filters except the current one (hierarchical filtering)
    Object.entries(columnFilters).forEach(([col, filterValues]) => {
      if (col !== column && filterValues && Array.isArray(filterValues) && filterValues.length > 0) {
        allData = allData.filter(row => 
          filterValues.includes(String(row[col] || ''))
        );
      }
    });
    
    // Get unique values from the filtered data
    const values = allData.map(row => String(row[column] || '')).filter(Boolean);
    return Array.from(new Set(values)).sort() as string[];
  };

  const FilterMenu = ({ column }: { column: string }) => {
    const uniqueValues = getUniqueColumnValues(column);
    const current = columnFilters[column] || [];
    const [temp, setTemp] = useState<string[]>(current);

    const toggleVal = (val: string) => {
      setTemp(prev => (prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]));
    };

    const selectAll = () => {
      setTemp(temp.length === uniqueValues.length ? [] : uniqueValues);
    };

    const apply = () => handleColumnFilter(column, temp);

    return (
      <div className="w-64 max-h-80 overflow-y-auto">
        <div className="p-2 border-b">
          <div className="flex items-center space-x-2 mb-2">
            <Checkbox checked={temp.length === uniqueValues.length} onCheckedChange={selectAll} />
            <span className="text-sm font-medium">Select All</span>
          </div>
        </div>
        <div className="p-2 space-y-1">
          {uniqueValues.map((v, i) => (
            <div key={i} className="flex items-center space-x-2">
              <Checkbox checked={temp.includes(v)} onCheckedChange={() => toggleVal(v)} />
              <span className="text-sm">{v}</span>
            </div>
          ))}
        </div>
        <div className="p-2 border-t flex space-x-2">
          <Button size="sm" onClick={apply}>Apply</Button>
          <Button size="sm" variant="outline" onClick={() => setTemp(current)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  };

  // Filtered and sorted data from entire dataset
  const allFilteredData = React.useMemo(() => {
    if (!rawCSV) return [];
    
    const lines = rawCSV.split(/\r?\n/).filter(line => line.trim());
    if (lines.length <= 1) return [];
    
    const csvHeaders = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const numeric = /^-?\d+(?:\.\d+)?$/;
    
    // Parse all data
    let allData = lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
      const row: Record<string, any> = {};
      csvHeaders.forEach((h, i) => {
        const value = values[i] ?? '';
        row[h] = numeric.test(value) ? parseFloat(value) : value;
      });
      return row;
    });
    
    // Apply column filters to entire dataset
    Object.entries(columnFilters).forEach(([column, values]) => {
      if (values && Array.isArray(values) && values.length > 0) {
        allData = allData.filter(row => 
          values.includes(String(row[column] || ''))
        );
      }
    });
    
    // Apply sorting to entire dataset
    if (sortColumn) {
      allData = [...allData].sort((a, b) => {
        const aVal = a[sortColumn];
        const bVal = b[sortColumn];
        
        // Handle null/undefined values
        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return sortDirection === 'asc' ? 1 : -1;
        if (bVal == null) return sortDirection === 'asc' ? -1 : 1;
        
        // Handle numeric values
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        }
        
        // Handle string values
        const aStr = String(aVal).toLowerCase();
        const bStr = String(bVal).toLowerCase();
        return sortDirection === 'asc' 
          ? aStr.localeCompare(bStr)
          : bStr.localeCompare(aStr);
      });
    }
    
    return allData;
  }, [rawCSV, columnFilters, sortColumn, sortDirection]);

  // Get current page data from filtered results
  const displayedData = React.useMemo(() => {
    if (!pagination) return allFilteredData;
    
    const startIndex = (pagination.current_page - 1) * pagination.page_size;
    const endIndex = startIndex + pagination.page_size;
    
    return allFilteredData.slice(startIndex, endIndex);
  }, [allFilteredData, pagination]);

  // Fetch available saved dataframes once
  useEffect(() => {
    let query = '';
    const envStr = localStorage.getItem('env');
    if (envStr) {
      try {
        const env = JSON.parse(envStr);
        query =
          '?' +
          new URLSearchParams({
            client_id: env.CLIENT_ID || '',
            app_id: env.APP_ID || '',
            project_id: env.PROJECT_ID || '',
            client_name: env.CLIENT_NAME || '',
            app_name: env.APP_NAME || '',
            project_name: env.PROJECT_NAME || '',
          }).toString();
      } catch {
        /* ignore */
      }
    }
    fetch(`${VALIDATE_API}/list_saved_dataframes${query}`)
      .then(r => r.json())
      .then(d => {
        // Filter to only show Arrow files, exclude CSV and XLSX files
        const allFiles = Array.isArray(d.files) ? d.files : [];
        const arrowFiles = allFiles.filter(f => 
          f.object_name && f.object_name.endsWith('.arrow')
        );
        setFrames(arrowFiles);
      })
      .catch(() => setFrames([]));
  }, []);


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

  // Legacy fetchCardinalityData removed - now using DataSummaryView

  const fetchData = async (page: number = 1) => {
    setLoading(true);
    setError(null);
    
    try {
      let csvData = '';
      
      if (fullCsv) {
        // Use full CSV data (complete dataset)
        csvData = fullCsv;
        const { headers, rows } = parseCSV(csvData);
        
        // Client-side pagination
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
        const response = await fetch(
          `${CONCAT_API}/cached_dataframe?object_name=${encodeURIComponent(resultFilePath)}&page=${page}&page_size=20`
        );
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result: DataResponse = await response.json();
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
      console.error('Error fetching data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (fullCsv) {
      setRawCSV(fullCsv);
    }
  }, [fullCsv]);

  useEffect(() => {
    if (resultFilePath) {
      fetchData(1);
    } else {
      setIsSaved(false);
    }
  }, [resultFilePath]);

  // Legacy cardinality fetch useEffect removed - now using DataSummaryView

  const handlePageChange = (page: number) => {
    fetchData(page);
  };

  // Open save modal with default filename
  const handleSaveDataFrame = () => {
    const csvToSave = fullCsv || rawCSV;
    if (!csvToSave) return;
    
    // Generate default filename
    const defaultFilename = `concat_${file1?.split('/')?.pop() || 'file1'}_${file2?.split('/')?.pop() || 'file2'}_${Date.now()}`;
    setSaveFileName(defaultFilename);
    setShowSaveModal(true);
  };

  // Actually save the DataFrame with the chosen filename
  const confirmSaveDataFrame = async () => {
    const csvToSave = fullCsv || rawCSV;
    if (!csvToSave) return;
    
    setSaveLoading(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const filename = saveFileName.trim() || `concat_${file1?.split('/')?.pop() || 'file1'}_${file2?.split('/')?.pop() || 'file2'}_${Date.now()}`;
      const response = await fetch(`${CONCAT_API}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv_data: csvToSave, filename }),
      });
      if (!response.ok) {
        throw new Error(`Save failed: ${response.statusText}`);
      }
      const result = await response.json();
      setSaveSuccess(true);
      setIsSaved(true);
      setShowSaveModal(false);
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

  // Always show the canvas if we have file selections, even without results
  const hasFileSelections = !!(file1 && file2);
  
  if (!hasFileSelections && !resultFilePath && !fullCsv) {
    return (
      <div className="w-full h-full p-6 bg-gradient-to-br from-slate-50 via-green-50/30 to-green-50/50 overflow-y-auto relative">
        <div className="absolute inset-0 opacity-20">
          <svg width="80" height="80" viewBox="0 0 80 80" className="absolute inset-0 w-full h-full">
            <defs>
              <pattern id="emptyGrid" width="80" height="80" patternUnits="userSpaceOnUse">
                <path d="M 80 0 L 0 0 0 80" fill="none" stroke="rgb(148 163 184 / 0.15)" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#emptyGrid)" />
          </svg>
        </div>

        <div className="relative z-10 flex items-center justify-center h-full">
          <div className="text-center max-w-md">
            <div className="w-24 h-24 mx-auto mb-8 rounded-2xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-2xl transform rotate-3 hover:rotate-0 transition-transform duration-300">
              <ArrowRight className="w-12 h-12 text-white drop-shadow-lg" />
            </div>
            <h3 className="text-3xl font-bold text-gray-900 mb-3 bg-gradient-to-r from-green-500 to-green-600 bg-clip-text text-transparent">
              Concat Operation
            </h3>
            <p className="text-gray-600 mb-6 text-lg font-medium leading-relaxed">
              Select both files from the properties panel to get started
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full p-6 bg-gradient-to-br from-slate-50 to-blue-50 overflow-y-auto" style={{position: 'relative'}}>
      {/* Data Summary - Single instance with source selection in controls */}
      {file1 && file2 && settings?.showDataSummary && (
        <div className="mb-6">
          <DataSummaryView
            key={`${activeCardinalityTab}-${activeCardinalityTab === 'primary' ? file1 : file2}`}
            objectName={activeCardinalityTab === 'primary' ? file1 : file2}
            atomId={atomId || ''}
            subtitleClickable={true}
            onSubtitleClick={() => {
              const currentFile = activeCardinalityTab === 'primary' ? file1 : file2;
              if (currentFile && atomId) {
                window.open(`/dataframe?name=${encodeURIComponent(currentFile)}`, '_blank');
              }
            }}
            defaultMinimized={false}
            controls={
              <div className="flex bg-slate-100 rounded-md border border-slate-200 overflow-hidden">
                <button
                  onClick={() => setActiveCardinalityTab('primary')}
                  className={`px-4 py-1.5 text-sm font-medium transition-all ${
                    activeCardinalityTab === 'primary'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Primary Source
                </button>
                <button
                  onClick={() => setActiveCardinalityTab('secondary')}
                  className={`px-4 py-1.5 text-sm font-medium transition-all border-l border-slate-200 ${
                    activeCardinalityTab === 'secondary'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Secondary Source
                </button>
              </div>
            }
          />
        </div>
      )}
      {/* Current Selection (Configuration) */}
      {/* <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm mb-6 overflow-hidden">
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
                  <SingleSelectDropdown
                    label=""
                    placeholder="Select file"
                    value={file1 || ""}
                    onValueChange={(value) => updateSettings(atomId, { file1: value })}
                    options={frames.map(f => ({ 
                      value: f.object_name, 
                      label: f.csv_name.split('/').pop() || f.csv_name
                    }))}
                    className="w-full"
                  />
                </div>
                <div>
                  <div className="flex items-center mb-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                    <span className="font-medium text-gray-700">Secondary Source</span>
                  </div>
                  <SingleSelectDropdown
                    label=""
                    placeholder="Select file"
                    value={file2 || ""}
                    onValueChange={(value) => updateSettings(atomId, { file2: value })}
                    options={frames.map(f => ({ 
                      value: f.object_name, 
                      label: f.csv_name.split('/').pop() || f.csv_name
                    }))}
                    className="w-full"
                  />
                </div>
                <div>
                  <div className="flex items-center mb-2">
                    <div className="w-2 h-2 bg-purple-500 rounded-full mr-2"></div>
                    <span className="font-medium text-gray-700">Strategy</span>
                  </div>
                  <SingleSelectDropdown
                    label=""
                    placeholder="Select direction"
                    value={direction || ""}
                    onValueChange={(value) => updateSettings(atomId, { direction: value })}
                    options={[
                      { value: "vertical", label: "Vertical" },
                      { value: "horizontal", label: "Horizontal" }
                    ]}
                    className="w-full"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card> */}

      {/* Concat Results */}
      {!resultFilePath && !fullCsv ? (
        <div className="p-4 text-center text-gray-500">
          <p>Files selected! Click the "Perform Concat" button in the settings tab to see results.</p>
        </div>
      ) : headers.length === 0 || data.length === 0 ? (
        <div className="p-4 text-center text-gray-500">No results to display.</div>
      ) : (
        <div>
          <Table
            headers={headers.map((header, index) => (
              <ContextMenu key={header}>
                <ContextMenuTrigger asChild>
                  <div className="flex items-center gap-1 cursor-pointer">
                    {header}
                    {sortColumn === header && (
                      sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                    )}
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-48 bg-white border border-gray-200 shadow-lg rounded-md">
                  <ContextMenuSub>
                    <ContextMenuSubTrigger className="flex items-center">
                      <ArrowUp className="w-4 h-4 mr-2" /> Sort
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md">
                      <ContextMenuItem onClick={() => handleSort(header, 'asc')}>
                        <ArrowUp className="w-4 h-4 mr-2" /> Ascending
                      </ContextMenuItem>
                      <ContextMenuItem onClick={() => handleSort(header, 'desc')}>
                        <ArrowDown className="w-4 h-4 mr-2" /> Descending
                      </ContextMenuItem>
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                  <ContextMenuSeparator />
                  <ContextMenuSub>
                    <ContextMenuSubTrigger className="flex items-center">
                      <FilterIcon className="w-4 h-4 mr-2" /> Filter
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md p-0">
                      <FilterMenu column={header} />
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                  {columnFilters[header]?.length > 0 && (
                    <>
                      <ContextMenuSeparator />
                      <ContextMenuItem onClick={() => clearColumnFilter(header)}>
                        Clear Filter
                      </ContextMenuItem>
                    </>
                  )}
                </ContextMenuContent>
              </ContextMenu>
            ))}
            colClasses={headers.map(() => "w-auto")}
            bodyClassName="max-h-[400px] overflow-y-auto"
            borderColor={atom?.color ? `border-${atom.color.replace('bg-', '')}` : 'border-blue-500'}
            customHeader={{
              title: "Results",
              controls: (
                <div className="flex items-center gap-3">
                  <span className="inline-block bg-green-50 border border-green-200 text-green-700 text-sm font-semibold px-3 py-1 rounded">
                    {allFilteredData.length.toLocaleString()} rows • {headers.length} columns
                  </span>
                  <Button
                    onClick={handleSaveDataFrame}
                    disabled={saveLoading}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {saveLoading ? 'Saving...' : 'Save As'}
                  </Button>
                  {saveError && <span className="text-red-600 text-sm">{saveError}</span>}
                  {saveSuccess && <span className="text-green-600 text-sm">Saved!</span>}
                </div>
              )
            }}
          >
            {displayedData.map((row, rowIndex) => (
              <tr key={rowIndex} className="table-row">
                {headers.map((header, colIndex) => (
                  <td key={colIndex} className="table-cell text-center font-medium text-gray-700">
                    {row[header] !== null && row[header] !== undefined && row[header] !== '' ? (
                      typeof row[header] === 'number' ? row[header] : String(row[header])
                    ) : (
                      <span className="px-2 py-0.5 text-xs font-medium text-gray-500 border border-gray-300 rounded-full">null</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </Table>
        </div>
      )}

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

      {/* Save DataFrame Modal */}
      <Dialog open={showSaveModal} onOpenChange={setShowSaveModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Save DataFrame</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              File Name
            </label>
            <Input
              value={saveFileName}
              onChange={(e) => setSaveFileName(e.target.value)}
              placeholder="Enter file name"
              className="w-full"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && saveFileName.trim()) {
                  confirmSaveDataFrame();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowSaveModal(false)}
              disabled={saveLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmSaveDataFrame}
              disabled={saveLoading || !saveFileName.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {saveLoading ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ConcatCanvas;