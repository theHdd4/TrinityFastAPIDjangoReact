import React, { useEffect, useState, useMemo } from 'react';
import { MERGE_API } from '@/lib/api';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { VALIDATE_API } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
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
import Table from "@/templates/tables/table";
import merge from "../index";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { ArrowUp, ArrowDown, FilterIcon, Plus } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SingleSelectDropdown, MultiSelectDropdown } from '@/templates/dropdown';
// Icons
const Loader2 = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

// removed unused Database icon
/* const Database = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M3 5V19A9 3 0 0 0 12 22h0a9 3 0 0 0 9-3V5" />
    <path d="M3 12a9 3 0 0 0 9 3h0a9 3 0 0 0 9-3" />
  </svg>
);

*/
const GitMerge = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="18" r="3" />
    <circle cx="6" cy="6" r="3" />
    <path d="M6 21V9a9 9 0 0 0 9 9" />
  </svg>
);

interface MergeCanvasProps {
  atomId: string; // id of the atom – required to update store
  mergeId?: string;
  resultFilePath?: string;
  file1?: string;
  file2?: string;
  joinColumns?: string[];
  joinType?: string;
  availableColumns?: string[];
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

const MergeCanvas: React.FC<MergeCanvasProps> = ({ atomId, 
  mergeId, 
  resultFilePath, 
  file1, 
  file2, 
  joinColumns = [], 
  joinType = 'inner',
  availableColumns = [],
  unsavedData
}) => {

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

  // list of saved dataframes
  interface Frame { object_name: string; csv_name: string; }
  const [frames, setFrames] = useState<Frame[]>([]);

  // Cardinality view state
  const [cardinalityData, setCardinalityData] = useState<{
    primary: any[];
    secondary: any[];
  }>({ primary: [], secondary: [] });
  const [cardinalityLoading, setCardinalityLoading] = useState<{
    primary: boolean;
    secondary: boolean;
  }>({ primary: false, secondary: false });
  const [cardinalityError, setCardinalityError] = useState<{
    primary: string | null;
    secondary: string | null;
  }>({ primary: null, secondary: null });
  const [activeCardinalityTab, setActiveCardinalityTab] = useState<'primary' | 'secondary'>('primary');
  
  // Get input file name based on active tab for clickable subtitle
  const inputFileName = activeCardinalityTab === 'primary' ? (file1 || '') : (file2 || '');

  // Handle opening the input file in a new tab
  const handleViewDataClick = () => {
    if (inputFileName && atomId) {
      window.open(`/dataframe?name=${encodeURIComponent(inputFileName)}`, '_blank');
    }
  };
  
  // Sorting and filtering state for cardinality view
  const [cardinalitySortColumn, setCardinalitySortColumn] = useState<string>('unique_count');
  const [cardinalitySortDirection, setCardinalitySortDirection] = useState<'asc' | 'desc'>('desc');
  const [cardinalityColumnFilters, setCardinalityColumnFilters] = useState<Record<string, string[]>>({});

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

  // Cardinality sorting and filtering functions
  const handleCardinalitySort = (column: string, direction?: 'asc' | 'desc') => {
    if (cardinalitySortColumn === column) {
      if (cardinalitySortDirection === 'asc') {
        setCardinalitySortDirection('desc');
      } else if (cardinalitySortDirection === 'desc') {
        setCardinalitySortColumn('');
        setCardinalitySortDirection('asc');
      }
    } else {
      setCardinalitySortColumn(column);
      setCardinalitySortDirection(direction || 'asc');
    }
  };

  const handleCardinalityColumnFilter = (column: string, values: string[]) => {
    setCardinalityColumnFilters(prev => ({
      ...prev,
      [column]: values
    }));
  };

  const clearCardinalityColumnFilter = (column: string) => {
    setCardinalityColumnFilters(prev => {
      const cpy = { ...prev };
      delete cpy[column];
      return cpy;
    });
  };

  const getCardinalityUniqueColumnValues = (column: string, sourceType: 'primary' | 'secondary'): string[] => {
    const data = cardinalityData[sourceType];
    if (!Array.isArray(data) || data.length === 0) return [];

    // Apply other active filters to get hierarchical filtering
    const otherFilters = Object.entries(cardinalityColumnFilters).filter(([key]) => key !== column);
    let dataToUse = data;

    if (otherFilters.length > 0) {
      dataToUse = data.filter(item => {
        return otherFilters.every(([filterColumn, filterValues]) => {
          if (!Array.isArray(filterValues) || filterValues.length === 0) return true;
          const cellValue = String(item[filterColumn] || '');
          return filterValues.includes(cellValue);
        });
      });
    }

    const values = dataToUse.map(item => String(item[column] || ''));
    const uniqueValues = Array.from(new Set(values));
    return uniqueValues.sort() as string[];
  };

  const CardinalityFilterMenu = ({ column, sourceType }: { column: string; sourceType: 'primary' | 'secondary' }) => {
    const uniqueValues = getCardinalityUniqueColumnValues(column, sourceType);
    const current = cardinalityColumnFilters[column] || [];
    const [temp, setTemp] = useState<string[]>(current);

    const toggleVal = (val: string) => {
      setTemp(prev => (prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]));
    };

    const selectAll = () => {
      setTemp(temp.length === uniqueValues.length ? [] : uniqueValues);
    };

    const apply = () => {
      handleCardinalityColumnFilter(column, temp);
    };

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

  // Displayed cardinality data with filtering and sorting
  const displayedCardinality = useMemo(() => {
    const sourceType = activeCardinalityTab;
    const data = cardinalityData[sourceType];
    if (!Array.isArray(data) || data.length === 0) {
      return [];
    }

    let filtered = data.filter(c => c.unique_count > 0);

    // Apply column filters
    Object.entries(cardinalityColumnFilters).forEach(([column, filterValues]) => {
      if (Array.isArray(filterValues) && filterValues.length > 0) {
        filtered = filtered.filter(row => 
          filterValues.includes(String(row[column] || ''))
        );
      }
    });

    // Apply sorting
    if (cardinalitySortColumn) {
      filtered = [...filtered].sort((a, b) => {
        const aVal = a[cardinalitySortColumn];
        const bVal = b[cardinalitySortColumn];
        
        // Handle null/undefined values
        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return cardinalitySortDirection === 'asc' ? 1 : -1;
        if (bVal == null) return cardinalitySortDirection === 'asc' ? -1 : 1;
        
        // Handle numeric values
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return cardinalitySortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        }
        
        // Handle string values
        const aStr = String(aVal).toLowerCase();
        const bStr = String(bVal).toLowerCase();
        return cardinalitySortDirection === 'asc' 
          ? aStr.localeCompare(bStr)
          : bStr.localeCompare(aStr);
      });
    }

    return filtered;
  }, [cardinalityData, activeCardinalityTab, cardinalityColumnFilters, cardinalitySortColumn, cardinalitySortDirection]);

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
      if (col !== column && filterValues && filterValues.length > 0) {
        allData = allData.filter(row => 
          filterValues.includes(String(row[col] || ''))
        );
      }
    });
    
    // Get unique values from the filtered data
    const values = allData.map(row => String(row[column] || '')).filter(Boolean);
    return Array.from(new Set(values)).sort();
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
      if (values && values.length > 0) {
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

  useEffect(() => {
    // fetch list once
    const envStr = localStorage.getItem('env');
    let query = '';
    if (envStr) {
      try {
        const env = JSON.parse(envStr);
        query = '?' + new URLSearchParams({
          client_id: env.CLIENT_ID || '',
          app_id: env.APP_ID || '',
          project_id: env.PROJECT_ID || '',
          client_name: env.CLIENT_NAME || '',
          app_name: env.APP_NAME || '',
          project_name: env.PROJECT_NAME || ''
        }).toString();
      } catch {/* ignore */}
    }
    fetch(`${VALIDATE_API}/list_saved_dataframes${query}`)
      .then(r=>r.json()).then(d=>setFrames(Array.isArray(d.files)? d.files : []))
      .catch(()=>setFrames([]));
  }, []);


  // ==== Store updater for settings ====
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);



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

  // Cardinality data fetching functions
  const fetchCardinalityData = async (sourceType: 'primary' | 'secondary') => {
    const currentAtom = useLaboratoryStore.getState().getAtom(atomId);
    if (!currentAtom?.settings?.file1 || !currentAtom?.settings?.file2) {
      return;
    }

    setCardinalityLoading(prev => ({ ...prev, [sourceType]: true }));
    setCardinalityError(prev => ({ ...prev, [sourceType]: null }));

    try {
      const filePath = sourceType === 'primary' 
        ? currentAtom.settings.file1 
        : currentAtom.settings.file2;

      // 🔧 CRITICAL FIX: Construct full path if only filename is stored
      let fullFilePath = filePath;
      
      // Get environment context to construct full path
      const envStr = localStorage.getItem('env');
      if (envStr && filePath && !filePath.includes('/')) {
        try {
          const env = JSON.parse(envStr);
          const clientName = env.CLIENT_NAME || '';
          const appName = env.APP_NAME || '';
          const projectName = env.PROJECT_NAME || '';
          
          if (clientName && appName && projectName) {
            fullFilePath = `${clientName}/${appName}/${projectName}/${filePath}`;
            console.log(`🔧 Constructed full path for merge cardinality: ${filePath} → ${fullFilePath}`);
          }
        } catch (e) {
          console.warn('Failed to construct full path for merge cardinality:', e);
        }
      }

      const formData = new FormData();
      formData.append('validator_atom_id', currentAtom.id);
      formData.append('file_key', fullFilePath);
      formData.append('bucket_name', 'trinity');
      formData.append('object_names', fullFilePath);
      formData.append('source_type', sourceType);


      const response = await fetch(`${MERGE_API}/cardinality`, {
        method: 'POST',
        body: formData,
      });


      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch cardinality data: ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();
      
      if (result.status === 'SUCCESS') {
        setCardinalityData(prev => ({
          ...prev,
          [sourceType]: result.cardinality
        }));
      } else {
        throw new Error(result.message || 'Failed to fetch cardinality data');
      }
    } catch (error) {
      setCardinalityError(prev => ({
        ...prev,
        [sourceType]: error instanceof Error ? error.message : 'Failed to fetch cardinality data'
      }));
    } finally {
      setCardinalityLoading(prev => ({ ...prev, [sourceType]: false }));
    }
  };

  const fetchData = async (page: number = 1) => {
    if (!resultFilePath && !unsavedData) {
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      let csvData: string;
      
      if (unsavedData) {
        // Use unsaved data directly
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
        
        const response = await fetch(url);
        
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
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
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (resultFilePath || unsavedData) {
      fetchData(1);
    } else {
      setIsSaved(false);
    }
  }, [resultFilePath, unsavedData]);

  // Fetch cardinality data when data sources change
  useEffect(() => {
    const currentAtom = useLaboratoryStore.getState().getAtom(atomId);
    if (currentAtom?.settings?.file1 && currentAtom?.settings?.file2) {
      fetchCardinalityData('primary');
      fetchCardinalityData('secondary');
    } else {
      setCardinalityData({ primary: [], secondary: [] });
      setCardinalityLoading({ primary: false, secondary: false });
      setCardinalityError({ primary: null, secondary: null });
    }
  }, [atom?.settings?.file1, atom?.settings?.file2, atomId]);

  const handlePageChange = (page: number) => {
    // Now pagination works for both saved and unsaved data
    fetchData(page);
  };

  // Open save modal with default filename
  const handleSaveDataFrame = () => {
    if (!rawCSV) return;
    
    // Generate default filename
    const defaultFilename = `merge_${file1?.split('/').pop() || 'file1'}_${file2?.split('/').pop() || 'file2'}_${Date.now()}`;
    setSaveFileName(defaultFilename);
    setShowSaveModal(true);
  };

  // Actually save the DataFrame with the chosen filename
  const confirmSaveDataFrame = async () => {
    if (!rawCSV) return;
    
    setSaveLoading(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const filename = saveFileName.trim() || `merge_${file1?.split('/').pop() || 'file1'}_${file2?.split('/').pop() || 'file2'}_${Date.now()}`;
      
      // Get card_id and canvas_position for pipeline tracking
      const cards = useLaboratoryStore.getState().cards;
      const card = cards.find(c => Array.isArray(c.atoms) && c.atoms.some(a => a.id === atomId));
      const cardId = card?.id || '';
      const canvasPosition = card?.canvas_position ?? 0;
      
      const response = await fetch(`${MERGE_API}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          csv_data: rawCSV, 
          filename,
          // Pipeline tracking parameters
          validator_atom_id: atomId,
          card_id: cardId,
          canvas_position: canvasPosition,
        }),
      });
      if (!response.ok) {
        throw new Error(`Save failed: ${response.statusText}`);
      }
      const result = await response.json();
      setSaveSuccess(true);
      setIsSaved(true);
      setShowSaveModal(false);
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

  // Always show the canvas if we have file selections, even without results
  const hasFileSelections = !!(file1 && file2);
  
  if (!hasFileSelections && !resultFilePath && !unsavedData) {
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
              <GitMerge className="w-12 h-12 text-white drop-shadow-lg" />
            </div>
            <h3 className="text-3xl font-bold text-gray-900 mb-3 bg-gradient-to-r from-green-500 to-green-600 bg-clip-text text-transparent">
              Merge Operation
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
      {/* Cardinality View */}
      {(() => {
        const currentAtom = useLaboratoryStore.getState().getAtom(atomId);
        const shouldShow = !!(currentAtom?.settings?.file1 && currentAtom?.settings?.file2);
        return shouldShow;
      })() && (
        <div className="mb-6">
          <Table
            headers={[
              <ContextMenu key="Column">
                <ContextMenuTrigger asChild>
                  <div className="flex items-center gap-1 cursor-pointer">
                    Column
                    {cardinalitySortColumn === 'column' && (
                      cardinalitySortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                    )}
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-48 bg-white border border-gray-200 shadow-lg rounded-md">
                  <ContextMenuSub>
                    <ContextMenuSubTrigger className="flex items-center">
                      <ArrowUp className="w-4 h-4 mr-2" /> Sort
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md">
                      <ContextMenuItem onClick={() => handleCardinalitySort('column', 'asc')}>
                        <ArrowUp className="w-4 h-4 mr-2" /> Ascending
                      </ContextMenuItem>
                      <ContextMenuItem onClick={() => handleCardinalitySort('column', 'desc')}>
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
                      <CardinalityFilterMenu column="column" sourceType={activeCardinalityTab} />
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                  {cardinalityColumnFilters['column']?.length > 0 && (
                    <>
                      <ContextMenuSeparator />
                      <ContextMenuItem onClick={() => clearCardinalityColumnFilter('column')}>
                        Clear Filter
                      </ContextMenuItem>
                    </>
                  )}
                </ContextMenuContent>
              </ContextMenu>,
              <ContextMenu key="Data type">
                <ContextMenuTrigger asChild>
                  <div className="flex items-center gap-1 cursor-pointer">
                    Data type
                    {cardinalitySortColumn === 'data_type' && (
                      cardinalitySortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                    )}
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-48 bg-white border border-gray-200 shadow-lg rounded-md">
                  <ContextMenuSub>
                    <ContextMenuSubTrigger className="flex items-center">
                      <ArrowUp className="w-4 h-4 mr-2" /> Sort
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md">
                      <ContextMenuItem onClick={() => handleCardinalitySort('data_type', 'asc')}>
                        <ArrowUp className="w-4 h-4 mr-2" /> Ascending
                      </ContextMenuItem>
                      <ContextMenuItem onClick={() => handleCardinalitySort('data_type', 'desc')}>
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
                      <CardinalityFilterMenu column="data_type" sourceType={activeCardinalityTab} />
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                  {cardinalityColumnFilters['data_type']?.length > 0 && (
                    <>
                      <ContextMenuSeparator />
                      <ContextMenuItem onClick={() => clearCardinalityColumnFilter('data_type')}>
                        Clear Filter
                      </ContextMenuItem>
                    </>
                  )}
                </ContextMenuContent>
              </ContextMenu>,
              <ContextMenu key="Unique count">
                <ContextMenuTrigger asChild>
                  <div className="flex items-center gap-1 cursor-pointer">
                    Unique count
                    {cardinalitySortColumn === 'unique_count' && (
                      cardinalitySortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                    )}
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-48 bg-white border border-gray-200 shadow-lg rounded-md">
                  <ContextMenuSub>
                    <ContextMenuSubTrigger className="flex items-center">
                      <ArrowUp className="w-4 h-4 mr-2" /> Sort
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md">
                      <ContextMenuItem onClick={() => handleCardinalitySort('unique_count', 'asc')}>
                        <ArrowUp className="w-4 h-4 mr-2" /> Ascending
                      </ContextMenuItem>
                      <ContextMenuItem onClick={() => handleCardinalitySort('unique_count', 'desc')}>
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
                      <CardinalityFilterMenu column="unique_count" sourceType={activeCardinalityTab} />
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                  {cardinalityColumnFilters['unique_count']?.length > 0 && (
                    <>
                      <ContextMenuSeparator />
                      <ContextMenuItem onClick={() => clearCardinalityColumnFilter('unique_count')}>
                        Clear Filter
                      </ContextMenuItem>
                    </>
                  )}
                </ContextMenuContent>
              </ContextMenu>,
              "Sample values"
            ]}
            colClasses={["w-[25%]", "w-[20%]", "w-[20%]", "w-[35%]"]}
            bodyClassName="max-h-80 overflow-y-auto"
            borderColor={`border-${merge.color.replace('bg-', '')}`}
            customHeader={{
              title: "Data Summary",
              subtitle: "Data in detail",
              subtitleClickable: !!inputFileName && !!atomId,
              onSubtitleClick: handleViewDataClick,
              controls: (
                <Tabs value={activeCardinalityTab} onValueChange={(value) => setActiveCardinalityTab(value as 'primary' | 'secondary')}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="primary">Primary Source</TabsTrigger>
                    <TabsTrigger value="secondary">Secondary Source</TabsTrigger>
                  </TabsList>
                </Tabs>
              )
            }}
            defaultMinimized={true}
          >
            {(() => {
              
              if (cardinalityLoading[activeCardinalityTab]) {
                return <tr><td colSpan={4} className="text-center py-8 text-gray-500">Loading cardinality data...</td></tr>;
              } else if (cardinalityError[activeCardinalityTab]) {
                return <tr><td colSpan={4} className="text-center py-8 text-red-500">Error loading cardinality data: {cardinalityError[activeCardinalityTab]}</td></tr>;
              } else if (displayedCardinality.length === 0) {
                return <tr><td colSpan={4} className="text-center py-8 text-gray-500">No cardinality data available</td></tr>;
              } else {
                return (
                  displayedCardinality.map((row, index) => (
                    <tr key={index} className="table-row">
                      <td className="table-cell-primary">{row.column}</td>
                      <td className="table-cell">{row.data_type}</td>
                      <td className="table-cell">{row.unique_count.toLocaleString()}</td>
                      <td className="table-cell">
                        <div className="flex flex-wrap items-center gap-1">
                          {Array.isArray(row.unique_values) && row.unique_values.length > 0 ? (
                            <>
                              {row.unique_values.slice(0, 2).map((val: any, i: number) => (
                                <span
                                  key={i}
                                  className="inline-block bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs mr-1 mb-1"
                                >
                                  {String(val)}
                                </span>
                              ))}
                              {row.unique_values.length > 2 && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="flex items-center gap-0.5 text-xs text-slate-600 font-medium cursor-pointer">
                                      <Plus className="w-3 h-3" />
                                      {row.unique_values.length - 2} more
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent className="text-xs max-w-xs whitespace-pre-wrap">
                                    {row.unique_values
                                      .slice(2)
                                      .map((val: any) => String(val))
                                      .join(', ')}
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                );
              }
            })()}
          </Table>
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
              <div className="grid grid-cols-4 gap-6">
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
                    <span className="font-medium text-gray-700">Join Type</span>
                  </div>
                  <SingleSelectDropdown
                    label=""
                    placeholder="Select join type"
                    value={joinType}
                    onValueChange={(value) => updateSettings(atomId, { joinType: value })}
                    options={[
                      { value: "inner", label: "Inner" },
                      { value: "outer", label: "Outer" },
                      { value: "left", label: "Left" },
                      { value: "right", label: "Right" }
                    ]}
                    className="w-full"
                  />
                </div>
                <div>
                  <div className="flex items-center mb-2">
                    <div className="w-2 h-2 bg-amber-500 rounded-full mr-2"></div>
                    <span className="font-medium text-gray-700">Join Columns</span>
                  </div>
                  {availableColumns.length === 0 ? (
                    <span className="text-sm text-gray-500">No columns</span>
                  ) : (
                    <MultiSelectDropdown
                      label=""
                      selectedValues={joinColumns}
                      onSelectionChange={(selectedValues) => {
                        updateSettings(atomId, { joinColumns: selectedValues });
                      }}
                      options={availableColumns.map(col => ({ 
                        value: col, 
                        label: col 
                      }))}
                      showSelectAll={true}
                      showTrigger={true}
                      placeholder="Select columns"
                      className="w-full"
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card> */}

      {/* Merge Results */}
      {!resultFilePath && !unsavedData ? (
        <div className="p-4 text-center text-gray-500">
          <p>Files selected! Click the "Perform Merge" button in the settings tab to see results.</p>
        </div>
      ) : headers.length === 0 || data.length === 0 ? (
        <div className="p-4 text-center text-gray-500">No results to display.</div>
      ) : (
        <div className="mt-6">
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
            borderColor={`border-${merge.color.replace('bg-', '')}`}
            customHeader={{
              title: "Merge Results",
              controls: (
                <div className="flex items-center gap-3">
                  <span className="inline-block bg-green-50 border border-green-200 text-green-700 text-sm font-semibold px-3 py-1 rounded">
                    {allFilteredData.length.toLocaleString()} rows • {headers.length} columns
                  </span>
                  <Button
                    onClick={handleSaveDataFrame}
                    disabled={saveLoading}
                    className="bg-green-600 hover:bg-green-700 text-white"
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
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {saveLoading ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MergeCanvas; 