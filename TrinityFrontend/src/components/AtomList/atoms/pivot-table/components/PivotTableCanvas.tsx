import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  ChevronDown,
  Filter,
  Grid3x3,
  Info,
  Layout,
  Loader2,
  PlusSquare,
  MinusSquare,
  Save,
  RefreshCcw,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { PivotTableSettings } from '@/components/LaboratoryMode/store/laboratoryStore';
import { SCOPE_SELECTOR_API } from '@/lib/api';
import PivotTableFilterModal from './PivotTableFilterModal';
import { MultiSelectDropdown } from '@/templates/dropdown';

type PivotStyleOptions = {
  rowHeaders: boolean;
  columnHeaders: boolean;
  bandedRows: boolean;
};

type PivotTheme = {
  id: string;
  name: string;
  category: 'light' | 'dark';
  colors: {
    headerBg: string;
    headerText: string;
    rowBg: string;
    rowText: string;
    rowAltBg: string;
    rowAltText: string;
    rowHeaderBg: string;
    rowHeaderText: string;
    border: string;
    totalRowBg: string;
    totalRowText: string;
    totalColumnBg: string;
    totalColumnText: string;
  };
};

const DEFAULT_STYLE_OPTIONS: PivotStyleOptions = {
    rowHeaders: true,
    columnHeaders: true,
    bandedRows: false,
};

const DEFAULT_THEME_ID = 'light-slate';

const LIGHT_THEMES: PivotTheme[] = [
  {
    id: 'light-slate',
    name: 'Light Slate',
    category: 'light',
    colors: {
      headerBg: '#E6EBF5',
      headerText: '#1F2937',
      rowBg: '#FFFFFF',
      rowText: '#1F2937',
      rowAltBg: '#F5F7FB',
      rowAltText: '#1F2937',
      rowHeaderBg: '#DCE4F2',
      rowHeaderText: '#1D2738',
      border: '#D2D9E6',
      totalRowBg: '#C7D8F7',
      totalRowText: '#102A56',
      totalColumnBg: '#D0DCF9',
      totalColumnText: '#102A56',
    },
  },
  {
    id: 'light-azure',
    name: 'Light Azure',
    category: 'light',
    colors: {
      headerBg: '#DBEAFE',
      headerText: '#1E3A8A',
      rowBg: '#FFFFFF',
      rowText: '#1F2937',
      rowAltBg: '#EFF6FF',
      rowAltText: '#1E3A8A',
      rowHeaderBg: '#C7D2FE',
      rowHeaderText: '#1E3A8A',
      border: '#CBD5F5',
      totalRowBg: '#BCD4FF',
      totalRowText: '#1E3A8A',
      totalColumnBg: '#C7DCFF',
      totalColumnText: '#1E3A8A',
    },
  },
  {
    id: 'light-sunset',
    name: 'Light Sunset',
    category: 'light',
    colors: {
      headerBg: '#FFE4D6',
      headerText: '#7C2D12',
      rowBg: '#FFFFFF',
      rowText: '#3F2A1C',
      rowAltBg: '#FFF4EC',
      rowAltText: '#7C2D12',
      rowHeaderBg: '#FFD5C2',
      rowHeaderText: '#7C2D12',
      border: '#FBC9B3',
      totalRowBg: '#FFC4A8',
      totalRowText: '#7C2D12',
      totalColumnBg: '#FFD1B9',
      totalColumnText: '#7C2D12',
    },
  },
  {
    id: 'light-emerald',
    name: 'Light Emerald',
    category: 'light',
    colors: {
      headerBg: '#D4F5E8',
      headerText: '#065F46',
      rowBg: '#FFFFFF',
      rowText: '#064E3B',
      rowAltBg: '#ECFDF5',
      rowAltText: '#065F46',
      rowHeaderBg: '#C1F0DC',
      rowHeaderText: '#065F46',
      border: '#B4E4CF',
      totalRowBg: '#A8EDD0',
      totalRowText: '#064E3B',
      totalColumnBg: '#B7F0D8',
      totalColumnText: '#064E3B',
    },
  },
  {
    id: 'light-olive',
    name: 'Light Olive',
    category: 'light',
    colors: {
      headerBg: '#F2F5DC',
      headerText: '#4B5320',
      rowBg: '#FFFFFF',
      rowText: '#3A3E19',
      rowAltBg: '#F9FBEF',
      rowAltText: '#4B5320',
      rowHeaderBg: '#E5EDC7',
      rowHeaderText: '#4B5320',
      border: '#D7E1B5',
      totalRowBg: '#D7E9A9',
      totalRowText: '#3A4116',
      totalColumnBg: '#E1F0BA',
      totalColumnText: '#3A4116',
    },
  },
];

const DARK_THEMES: PivotTheme[] = [
  {
    id: 'dark-slate',
    name: 'Dark Slate',
    category: 'dark',
    colors: {
      headerBg: '#1F2937',
      headerText: '#F8FAFC',
      rowBg: '#111827',
      rowText: '#E5E7EB',
      rowAltBg: '#1A2333',
      rowAltText: '#E5E7EB',
      rowHeaderBg: '#273347',
      rowHeaderText: '#F8FAFC',
      border: '#334155',
      totalRowBg: '#2B3A55',
      totalRowText: '#F8FAFC',
      totalColumnBg: '#314263',
      totalColumnText: '#F8FAFC',
    },
  },
  {
    id: 'dark-emerald',
    name: 'Dark Emerald',
    category: 'dark',
    colors: {
      headerBg: '#064E3B',
      headerText: '#D1FAE5',
      rowBg: '#052C23',
      rowText: '#CCFBF1',
      rowAltBg: '#094235',
      rowAltText: '#D1FAE5',
      rowHeaderBg: '#0B5F46',
      rowHeaderText: '#ECFDF5',
      border: '#0F766E',
      totalRowBg: '#0F6652',
      totalRowText: '#ECFDF5',
      totalColumnBg: '#117063',
      totalColumnText: '#ECFDF5',
    },
  },
  {
    id: 'dark-indigo',
    name: 'Dark Indigo',
    category: 'dark',
    colors: {
      headerBg: '#312E81',
      headerText: '#E0E7FF',
      rowBg: '#1F1B4F',
      rowText: '#E0E7FF',
      rowAltBg: '#27206A',
      rowAltText: '#E0E7FF',
      rowHeaderBg: '#3A358F',
      rowHeaderText: '#E0E7FF',
      border: '#4338CA',
      totalRowBg: '#4338CA',
      totalRowText: '#F5F3FF',
      totalColumnBg: '#4C46D2',
      totalColumnText: '#F5F3FF',
    },
  },
  {
    id: 'dark-ember',
    name: 'Dark Ember',
    category: 'dark',
    colors: {
      headerBg: '#3B2314',
      headerText: '#FDEDD4',
      rowBg: '#22140A',
      rowText: '#FCE7C1',
      rowAltBg: '#2C1A0E',
      rowAltText: '#FCE7C1',
      rowHeaderBg: '#4A2D17',
      rowHeaderText: '#FDEDD4',
      border: '#5B3A1F',
      totalRowBg: '#6B3F1A',
      totalRowText: '#FFF5E0',
      totalColumnBg: '#7A4820',
      totalColumnText: '#FFF5E0',
    },
  },
];

const PIVOT_THEME_GROUPS: Array<{
  id: 'light' | 'dark';
  label: string;
  themes: PivotTheme[];
}> = [
  { id: 'light', label: 'Light', themes: LIGHT_THEMES },
  { id: 'dark', label: 'Dark', themes: DARK_THEMES },
];

const PIVOT_THEME_MAP: Record<string, PivotTheme> = [
  ...LIGHT_THEMES,
  ...DARK_THEMES,
].reduce<Record<string, PivotTheme>>((acc, theme) => {
  acc[theme.id] = theme;
  return acc;
}, {});

interface PivotTableCanvasProps {
  data: PivotTableSettings;
  onDataChange: (data: Partial<PivotTableSettings>) => void;
  isLoading: boolean;
  error: string | null;
  infoMessage?: string | null;
  isSaving: boolean;
  saveError: string | null;
  saveMessage: string | null;
  onRefresh: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  filterOptions: Record<string, string[]>;
  filterSelections: Record<string, string[]>;
  onGrandTotalsChange: (mode: 'off' | 'rows' | 'columns' | 'both') => void;
  onSubtotalsChange: (mode: 'off' | 'top' | 'bottom') => void;
  onStyleChange: (styleId: string) => void;
  onStyleOptionsChange: (options: PivotStyleOptions) => void;
  reportLayout: 'compact' | 'outline' | 'tabular';
  onReportLayoutChange: (layout: 'compact' | 'outline' | 'tabular') => void;
  collapsedKeys: string[];
  onToggleCollapse: (key: string) => void;
}

const PivotTableCanvas: React.FC<PivotTableCanvasProps> = ({
  data,
  onDataChange,
  isLoading,
  error,
  infoMessage,
  isSaving,
  saveError,
  saveMessage,
  onRefresh,
  onSave,
  onSaveAs,
  filterOptions,
  filterSelections,
  onGrandTotalsChange,
  onSubtotalsChange,
  onStyleChange,
  onStyleOptionsChange,
  reportLayout,
  onReportLayoutChange,
  collapsedKeys,
  onToggleCollapse,
}) => {
  const [loadingFilter, setLoadingFilter] = useState<string | null>(null);
  const [filterErrors, setFilterErrors] = useState<Record<string, string | null>>({});
  const [filterModalField, setFilterModalField] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const ROWS_PER_PAGE = 20;

  const styleOptions = useMemo<PivotStyleOptions>(() => {
    return {
      ...DEFAULT_STYLE_OPTIONS,
      ...(data.pivotStyleOptions ?? {}),
    };
  }, [data.pivotStyleOptions]);

  const selectedStyleId = data.pivotStyleId ?? DEFAULT_THEME_ID;
  const selectedTheme =
    PIVOT_THEME_MAP[selectedStyleId] ?? PIVOT_THEME_MAP[DEFAULT_THEME_ID];
  const themeColors = selectedTheme.colors;
  const borderColor = themeColors.border;
  const headerStyle = useMemo(
    () =>
      styleOptions.columnHeaders
        ? {
            backgroundColor: themeColors.headerBg,
            color: themeColors.headerText,
            borderColor,
          }
        : {
            backgroundColor: '#F6F6F6',
            color: '#3F3F3F',
            borderColor,
          },
    [styleOptions.columnHeaders, themeColors, borderColor]
  );
  const headerIconColor = styleOptions.columnHeaders
    ? themeColors.headerText
    : '#3F3F3F';
  const rowFields = data.rowFields ?? [];
  const rowFieldSet = useMemo(
    () => new Set(rowFields.map(field => field.toLowerCase())),
    [rowFields]
  );
  const tableStyle = useMemo(() => ({ borderColor }), [borderColor]);
  const collapsedSet = useMemo(() => new Set(collapsedKeys ?? []), [collapsedKeys]);

  const filters = data.filterFields ?? [];
  const pivotRows = data.pivotResults ?? [];
  const hasResults = pivotRows.length > 0;
  const showRowHeaders = styleOptions.rowHeaders;
  const showColumnHeaders = styleOptions.columnHeaders;
  const grandTotalsMode = data.grandTotalsMode ?? 'off';
  const subtotalsMode = data.subtotalsMode ?? 'off';

  const getAggregationLabel = (aggregation?: string, weightColumn?: string) => {
    const normalized = (aggregation ?? 'sum').toLowerCase();
    let baseLabel: string;
    
    switch (normalized) {
      case 'sum':
        baseLabel = 'Sum';
        break;
      case 'avg':
      case 'average':
      case 'mean':
        baseLabel = 'Average';
        break;
      case 'count':
        baseLabel = 'Count';
        break;
      case 'min':
        baseLabel = 'Min';
        break;
      case 'max':
        baseLabel = 'Max';
        break;
      case 'median':
        baseLabel = 'Median';
        break;
      case 'weighted_average':
        baseLabel = weightColumn ? `Weighted Average (by ${weightColumn})` : 'Weighted Average';
        break;
      default:
        baseLabel = normalized.length > 0
          ? `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`
          : 'Value';
    }
    
    return baseLabel;
  };

  const valueFieldLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    const valueConfigs = Array.isArray(data.valueFields) ? data.valueFields : [];
    valueConfigs.forEach((item) => {
      if (!item?.field) {
        return;
      }
      const aggLabel = getAggregationLabel(item.aggregation, (item as any).weightColumn);
      const label = `${aggLabel} of ${item.field}`;
      map.set(item.field, label);
      map.set(item.field.toLowerCase(), label);
    });
    return map;
  }, [data.valueFields]);

  const getNormalizedKey = (field: string) => field.toLowerCase();

  const getFilterOptions = (field: string): string[] => {
    const key = getNormalizedKey(field);
    return filterOptions[field] ?? filterOptions[key] ?? [];
  };

  const getFilterSelections = (field: string): string[] => {
    const key = getNormalizedKey(field);
    return filterSelections[field] ?? filterSelections[key] ?? [];
  };

  const ensureFilterOptions = useCallback(
    async (field: string) => {
      if (!data.dataSource) {
        return;
      }

      const normalized = getNormalizedKey(field);
      const existing = filterOptions[field] ?? filterOptions[normalized] ?? [];
      if (existing.length > 0) {
        return;
      }

      setLoadingFilter(field);
      setFilterErrors((prev) => ({ ...prev, [field]: null, [normalized]: null }));

      try {
        const params = new URLSearchParams({
          object_name: data.dataSource,
          column_name: field,
        });

        const response = await fetch(
          `${SCOPE_SELECTOR_API}/unique_values?${params.toString()}`,
        );

        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || `Failed to load unique values (${response.status})`);
        }

        const json = await response.json();
        const rawValues = Array.isArray(json.unique_values) ? json.unique_values : [];
        const values = rawValues
          .map((value: unknown) =>
            value === null || value === undefined ? '(Blank)' : String(value),
          )
          .filter((value, index, self) => value && self.indexOf(value) === index);

        const updatedOptions = {
          ...filterOptions,
          [field]: values,
          [normalized]: values,
        };

        const existingSelections = getFilterSelections(field);
        const synchronizeSelections =
          existingSelections.length === 0 ||
          existingSelections.some((item) => !values.includes(item))
            ? values
            : existingSelections;

        onDataChange({
          pivotFilterOptions: updatedOptions,
          pivotFilterSelections: {
            ...filterSelections,
            [field]: synchronizeSelections,
            [normalized]: synchronizeSelections,
          },
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to load unique values';
        setFilterErrors((prev) => ({
          ...prev,
          [field]: message,
          [getNormalizedKey(field)]: message,
        }));
      } finally {
        setLoadingFilter(null);
      }
    },
    [data.dataSource, filterOptions, filterSelections, onDataChange],
  );

  const handleSortChange = useCallback(
    (field: string, sortType: 'asc' | 'desc' | 'value_asc' | 'value_desc' | null) => {
      const currentSorting = data.pivotSorting ?? {};
      const newSorting: Record<string, { type: string; level?: number; preserve_hierarchy?: boolean }> = {};
      
      // Copy existing sorting, but normalize keys to match exact field names from rowFields/columnFields
      // Preserve level and preserve_hierarchy if they exist
      Object.entries(currentSorting).forEach(([key, value]) => {
        // Find the exact field name that matches (case-insensitive)
        const exactField = rowFields.find(f => f.toLowerCase() === key.toLowerCase()) ||
                          data.columnFields.find(f => f.toLowerCase() === key.toLowerCase()) ||
                          key;
        
        // Preserve full config if it exists
        if (value && typeof value === 'object' && 'type' in value) {
          const sortValue = value as { type: string; level?: number; preserve_hierarchy?: boolean };
          newSorting[exactField] = {
            type: sortValue.type as 'asc' | 'desc' | 'value_asc' | 'value_desc',
            level: sortValue.level,
            preserve_hierarchy: sortValue.preserve_hierarchy ?? true,
          };
        } else {
          newSorting[exactField] = { type: typeof value === 'string' ? (value as 'asc' | 'desc' | 'value_asc' | 'value_desc') : 'asc' };
        }
      });
      
      // Remove any existing sorting for this field (case-insensitive)
      const fieldLower = field.toLowerCase();
      Object.keys(newSorting).forEach(key => {
        if (key.toLowerCase() === fieldLower) {
          delete newSorting[key];
        }
      });
      
      if (sortType !== null) {
        // Use the exact field name from rowFields/columnFields
        const exactField = rowFields.find(f => f.toLowerCase() === fieldLower) ||
                          data.columnFields.find(f => f.toLowerCase() === fieldLower) ||
                          field;
        
        // Determine hierarchy level for this field (if it's a row field)
        const fieldIndex = rowFields.findIndex(f => f.toLowerCase() === fieldLower);
        const level = fieldIndex >= 0 ? fieldIndex : undefined;
        
        newSorting[exactField] = {
          type: sortType,
          level: level,
          preserve_hierarchy: true, // Default to preserving hierarchy
        };
      }
      
      console.log('Sort change - field:', field, 'exactField:', rowFields.find(f => f.toLowerCase() === fieldLower) || field, 'type:', sortType, 'level:', rowFields.findIndex(f => f.toLowerCase() === fieldLower), 'newSorting:', newSorting);
      onDataChange({ pivotSorting: newSorting });
    },
    [data.pivotSorting, data.columnFields, rowFields, onDataChange],
  );

  const handleFilterModalOpen = useCallback(
    (field: string) => {
      // Load options if not already loaded (this will auto-select all if selections are empty)
      ensureFilterOptions(field);
      setFilterModalField(field);
    },
    [ensureFilterOptions],
  );

  const handleFilterSelectionsChange = useCallback(
    (field: string, selections: string[]) => {
      const normalized = getNormalizedKey(field);
      
      // Update filter selections without moving fields to filter bucket
      // Row and column fields can be filtered without being in filterFields
      onDataChange({
        pivotFilterSelections: {
          ...filterSelections,
          [field]: selections,
          [normalized]: selections,
        },
      });
    },
    [filterSelections, onDataChange],
  );

  const getSortIcon = (field: string) => {
    const sorting = data.pivotSorting?.[field];
    if (!sorting) return <ArrowUpDown className="h-3 w-3" />;
    switch (sorting.type) {
      case 'asc':
        return <ArrowUp className="h-3 w-3" />;
      case 'desc':
        return <ArrowDown className="h-3 w-3" />;
      case 'value_asc':
        return <ArrowUp className="h-3 w-3" />;
      case 'value_desc':
        return <ArrowDown className="h-3 w-3" />;
      default:
        return <ArrowUpDown className="h-3 w-3" />;
    }
  };

  const renderFieldHeaderWithSortFilter = (field: string, isRowField: boolean = true) => {
    // Check sorting with case-insensitive lookup
    const sorting = data.pivotSorting?.[field] || 
                   (data.pivotSorting ? Object.entries(data.pivotSorting).find(([k]) => k.toLowerCase() === field.toLowerCase())?.[1] : undefined);
    const hasFilter = filterSelections[field] || filterSelections[getNormalizedKey(field)];
    const filterOptionsForField = getFilterOptions(field);
    const filterSelectionsForField = getFilterSelections(field);

    return (
      <div className="flex items-center gap-0.5 group/header">
        <span>{field}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="opacity-60 group-hover/header:opacity-100 transition-opacity p-0.5 hover:bg-muted rounded flex items-center justify-center ml-0.5"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-[11px] uppercase tracking-wide">
              Sort Options
            </DropdownMenuLabel>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                handleSortChange(field, 'asc');
              }}
              className={cn(
                'text-xs',
                sorting?.type === 'asc' ? 'font-semibold text-primary' : '',
              )}
            >
              <ArrowUp className="h-3 w-3 mr-2" />
              Sort A → Z
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                handleSortChange(field, 'desc');
              }}
              className={cn(
                'text-xs',
                sorting?.type === 'desc' ? 'font-semibold text-primary' : '',
              )}
            >
              <ArrowDown className="h-3 w-3 mr-2" />
              Sort Z → A
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                handleSortChange(field, 'value_asc');
              }}
              className={cn(
                'text-xs',
                sorting?.type === 'value_asc' ? 'font-semibold text-primary' : '',
              )}
            >
              <ArrowUp className="h-3 w-3 mr-2" />
              Sort by Value (Ascending)
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                handleSortChange(field, 'value_desc');
              }}
              className={cn(
                'text-xs',
                sorting?.type === 'value_desc' ? 'font-semibold text-primary' : '',
              )}
            >
              <ArrowDown className="h-3 w-3 mr-2" />
              Sort by Value (Descending)
            </DropdownMenuItem>
            {sorting && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    handleSortChange(field, null);
                  }}
                  className="text-xs"
                >
                  Clear Sort
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                handleFilterModalOpen(field);
              }}
              className={cn(
                'text-xs',
                hasFilter ? 'font-semibold text-primary' : '',
              )}
            >
              <Filter className="h-3 w-3 mr-2" />
              Filter...
              {hasFilter && filterSelectionsForField.length < filterOptionsForField.length && (
                <span className="ml-auto text-[10px]">
                  ({filterSelectionsForField.length} selected)
                </span>
              )}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  const columns = useMemo(() => {
    if (!hasResults) {
      return data.rowFields.length > 0
        ? [...data.rowFields]
        : ['Row Labels'];
    }

    const firstRow = pivotRows[0];
    const keys = Object.keys(firstRow);

    const lowerKeyMap = keys.reduce<Record<string, string>>((acc, key) => {
      acc[key.toLowerCase()] = key;
      return acc;
    }, {});

    const ordered: string[] = [];

    data.rowFields
      .filter(Boolean)
      .forEach((field) => {
        const match = lowerKeyMap[field.toLowerCase()];
        if (match && !ordered.includes(match)) {
          ordered.push(match);
        }
      });

    keys.forEach((key) => {
      if (!ordered.includes(key)) {
        ordered.push(key);
      }
    });

    return ordered;
  }, [data.rowFields, pivotRows, hasResults]);
  type ColumnNode = {
    key: string;
    parentKey: string | null;
    level: number;
    order: number;
    labels: Array<{ field: string; value: any }>;
    column: string | null;
    children: ColumnNode[];
  };

  type ColumnHeaderCell = {
    key: string;
    label: string;
    colSpan: number;
    rowSpan: number;
    level: number;
    isValueField: boolean;
  };

  const columnHeaderInfo = useMemo(() => {
    // Don't show column headers if columnFields is empty
    if (!data.columnFields || data.columnFields.length === 0) {
      return { rows: [] as ColumnHeaderCell[][], leafColumns: [] as string[] };
    }
    
    const rawNodes = Array.isArray(data.pivotColumnHierarchy)
      ? data.pivotColumnHierarchy
      : [];

    const nodeMap = new Map<string, ColumnNode>();

    rawNodes.forEach((raw: any) => {
      const rawKey = raw?.key;
      const key =
        typeof rawKey === 'string' && rawKey.length > 0
          ? rawKey
          : String(rawKey ?? '');
      if (!key) {
        return;
      }
      const node: ColumnNode = {
        key,
        parentKey:
          typeof raw?.parent_key === 'string' && raw.parent_key.length > 0
            ? raw.parent_key
            : null,
        level: Number(raw?.level ?? 0),
        order: Number(raw?.order ?? 0),
        labels: Array.isArray(raw?.labels) ? raw.labels : [],
        column:
          typeof raw?.column === 'string' && raw.column.length > 0
            ? raw.column
            : null,
        children: [],
      };
      nodeMap.set(key, node);
    });

    if (nodeMap.size === 0) {
      return { rows: [] as ColumnHeaderCell[][], leafColumns: [] as string[] };
    }

    const roots: ColumnNode[] = [];
    nodeMap.forEach((node) => {
      const parentKey = node.parentKey;
      if (parentKey && nodeMap.has(parentKey)) {
        nodeMap.get(parentKey)!.children.push(node);
      } else {
        roots.push(node);
      }
    });

    const sortRecursive = (items: ColumnNode[]) => {
      items.sort((a, b) => {
        // Check if nodes are Grand Total nodes by checking their labels and column name
        const aIsGrandTotal = 
          (a.column && (a.column.toLowerCase().includes('grand total') || a.column.toLowerCase() === 'grandtotal')) ||
          a.labels?.some(label => {
            const value = String(label.value ?? '').toLowerCase();
            return value.includes('grand total') || value === 'grandtotal';
          }) || false;
        const bIsGrandTotal = 
          (b.column && (b.column.toLowerCase().includes('grand total') || b.column.toLowerCase() === 'grandtotal')) ||
          b.labels?.some(label => {
            const value = String(label.value ?? '').toLowerCase();
            return value.includes('grand total') || value === 'grandtotal';
          }) || false;
        
        // Grand Total nodes go to the end
        if (aIsGrandTotal && !bIsGrandTotal) return 1;
        if (!aIsGrandTotal && bIsGrandTotal) return -1;
        
        // Otherwise sort by order
        return (a.order ?? 0) - (b.order ?? 0);
      });
      items.forEach((child) => sortRecursive(child.children));
    };
    sortRecursive(roots);

    let maxLevel = 0;
    const determineDepth = (node: ColumnNode) => {
      if (node.level > maxLevel) {
        maxLevel = node.level;
      }
      node.children.forEach(determineDepth);
    };
    roots.forEach(determineDepth);
    const depth = Math.max(maxLevel + 1, 1);

    const leafCountMap = new Map<string, number>();
    const leafColumns: string[] = [];

    const computeLeafCounts = (node: ColumnNode): number => {
      if (node.children.length === 0) {
        leafCountMap.set(node.key, 1);
        if (typeof node.column === 'string' && node.column.length > 0) {
          leafColumns.push(node.column);
        }
        return 1;
      }
      let total = 0;
      node.children.forEach((child) => {
        total += computeLeafCounts(child);
      });
      leafCountMap.set(node.key, total);
      return total;
    };
    roots.forEach(computeLeafCounts);

    // Sort leafColumns to put Grand Total columns at the end
    const isGrandTotalColumn = (col: string) => {
      const normalized = col.toLowerCase();
      return normalized.includes('grand total') || normalized === 'grandtotal';
    };
    leafColumns.sort((a, b) => {
      const aIsGrandTotal = isGrandTotalColumn(a);
      const bIsGrandTotal = isGrandTotalColumn(b);
      if (aIsGrandTotal && !bIsGrandTotal) return 1; // Grand Total goes to end
      if (!aIsGrandTotal && bIsGrandTotal) return -1; // Non-Grand Total stays first
      return 0; // Keep original order for same type
    });

    const rows: ColumnHeaderCell[][] = Array.from(
      { length: depth },
      () => [],
    );

    const pushNode = (node: ColumnNode) => {
      const level = Math.max(0, node.level ?? 0);
      const safeLevel = Math.min(level, rows.length - 1);
      const leafCount = leafCountMap.get(node.key) ?? 1;
      const hasChildren = node.children.length > 0;
      const labelEntry = node.labels?.[node.labels.length - 1];
      let labelValue = labelEntry?.value ?? '';
      const fieldName = labelEntry?.field ?? '';
      const isValueField = fieldName === '__value__';
      
      // Show the actual value for column field nodes (not the field name)
      // This displays the actual data values like "January", "February" instead of "MONTH"
      if (isValueField) {
        // For value fields, use the mapped label (e.g., "Sum of Sales")
        const normalizedLabel = String(labelValue ?? '').toLowerCase();
        labelValue =
          valueFieldLabelMap.get(normalizedLabel) ??
          valueFieldLabelMap.get(String(labelValue ?? '')) ??
          labelValue;
      }
      // For column field nodes (both parent and leaf), show the actual value
      
      const displayLabel =
        labelValue === null || labelValue === undefined || labelValue === ''
          ? '\u00A0'
          : String(labelValue);
      const rowSpan = hasChildren ? 1 : Math.max(depth - level, 1);
      rows[safeLevel].push({
        key: node.key,
        label: displayLabel,
        colSpan: leafCount,
        rowSpan,
        level,
        isValueField,
      });
      node.children.forEach(pushNode);
    };
    roots.forEach(pushNode);

    return { rows, leafColumns };
  }, [data.pivotColumnHierarchy, data.columnFields, valueFieldLabelMap]);

  const rawColumnHeaderRows = columnHeaderInfo.rows;
  const columnLeafColumns = columnHeaderInfo.leafColumns;
  const columnHeaderRows = showColumnHeaders ? rawColumnHeaderRows : [];

  const getHeaderCellClass = (cell: ColumnHeaderCell) =>
    cn(
      'text-[12px] uppercase tracking-wide font-semibold',
      cell.isValueField ? 'text-right' : 'text-left',
    );

  const baseValueColumns = useMemo(
    () => {
      // If columnFields is empty, don't show any value columns as headers
      if (!data.columnFields || data.columnFields.length === 0) {
        return [];
      }
      return columns.filter((column) => !rowFieldSet.has(column.toLowerCase()));
    },
    [columns, rowFieldSet, data.columnFields],
  );

  const valueColumns = useMemo(
    () => {
      // If columnFields is empty, don't show any column headers - only show value fields
      if (!data.columnFields || data.columnFields.length === 0) {
        // When no columnFields, only show actual value field columns (not cached column names)
        // Get value field names from valueFields settings
        if (data.valueFields && data.valueFields.length > 0) {
          return data.valueFields
            .filter((vf: any) => vf?.field)
            .map((vf: any) => {
              // Try to find matching column in results, or use the field name
              // This is the actual column name in the data, not the label
              const fieldName = vf.field;
              const matchingColumn = columns.find(
                (col) => col.toLowerCase() === fieldName.toLowerCase()
              );
              return matchingColumn || fieldName;
            });
        }
        return [];
      }
      return columnLeafColumns.length > 0 ? columnLeafColumns : baseValueColumns;
    },
    [columnLeafColumns, baseValueColumns, data.columnFields, data.valueFields, columns, rowFieldSet],
  );

  const canonicalizeKey = useCallback((key: unknown) => {
    if (key === null || key === undefined) return '';
    return String(key).toLowerCase().replace(/[^a-z0-9]+/g, '');
  }, []);

  const normalizedValueColumns = useMemo(
    () =>
      valueColumns.map((column) => ({
        name: column,
        canonical: canonicalizeKey(column),
      })),
    [canonicalizeKey, valueColumns],
  );

  const hasAutoSwitchedLayoutRef = useRef(false);

  useEffect(() => {
    const hasMultipleValueColumns = valueColumns.length > 1;
    if (!hasMultipleValueColumns) {
      hasAutoSwitchedLayoutRef.current = false;
      return;
    }

    if (
      reportLayout !== 'tabular' &&
      !hasAutoSwitchedLayoutRef.current
    ) {
      hasAutoSwitchedLayoutRef.current = true;
      onReportLayoutChange('tabular');
    }
  }, [onReportLayoutChange, reportLayout, valueColumns.length]);

  const findRowKeyForField = useCallback((row: Record<string, any>, field: string): string | undefined => {
    if (!row || !field) {
      return undefined;
    }
    if (Object.prototype.hasOwnProperty.call(row, field)) {
      return field;
    }
    const target = field.toLowerCase();
    return Object.keys(row).find((key) => key.toLowerCase() === target);
  }, []);

  const getRowFieldValue = useCallback(
    (row: Record<string, any>, field: string): any => {
      const key = findRowKeyForField(row, field);
      if (!key) {
        return undefined;
      }
      return row[key];
    },
    [findRowKeyForField],
  );

  const findLabelForField = useCallback(
    (labels: Array<{ field: string; value: any }> | undefined, field: string) => {
      if (!labels || !field) {
        return undefined;
      }
      const target = field.toLowerCase();
      return labels.find((item) => (item.field ?? '').toLowerCase() === target);
    },
    [],
  );

  const pivotRowLookup = useMemo(() => {
    if (!rowFields.length || pivotRows.length === 0) {
      return new Map<string, Record<string, any>>();
    }

    const map = new Map<string, Record<string, any>>();

    pivotRows.forEach((row) => {
      const key = rowFields
        .map((field) => canonicalizeKey(getRowFieldValue(row, field)))
        .join('|');
      if (!map.has(key)) {
        map.set(key, row);
      }
    });

    return map;
  }, [canonicalizeKey, getRowFieldValue, pivotRows, rowFields]);

  const findMatchingPivotRow = useCallback(
    (labels: Array<{ field: string; value: any }>) => {
      if (!rowFields.length) {
        return pivotRows[0];
      }

      const key = rowFields
        .map((field) => {
          const label = findLabelForField(labels, field);
          return canonicalizeKey(label?.value);
        })
        .join('|');

      const directMatch = pivotRowLookup.get(key);
      if (directMatch) {
        return directMatch;
      }

      return pivotRows.find((row) =>
        rowFields.every((field, index) => {
          const label = labels?.[index];
          const rowValue = getRowFieldValue(row, field);
          const rowValKey = canonicalizeKey(rowValue);
          if (label && (label.field ?? '').toLowerCase() === field.toLowerCase()) {
            const labelKey = canonicalizeKey(label.value);
            return rowValKey === labelKey;
          }
          return rowValKey === '' || rowValKey.endsWith('total');
        }),
      );
    },
    [canonicalizeKey, findLabelForField, getRowFieldValue, pivotRowLookup, pivotRows, rowFields],
  );

  const buildRecordForNode = useCallback(
    (node: HierNode, includeValues: boolean = true) => {
      const record: Record<string, any> = {};
      const labelMap = new Map<string, any>();

      node.labels?.forEach(({ field, value }) => {
        record[field] = value;
        labelMap.set(canonicalizeKey(field), value);
      });

      rowFields.forEach((field) => {
        if (record[field] === undefined) {
          const mapped = labelMap.get(canonicalizeKey(field));
          if (mapped !== undefined) {
            record[field] = mapped;
          }
        }
      });

      // Only populate value columns if includeValues is true
      if (includeValues) {
        const sourceValues = new Map<string, any>();
        Object.entries(node.values ?? {}).forEach(([key, value]) => {
          sourceValues.set(canonicalizeKey(key), value);
        });

        normalizedValueColumns.forEach(({ name, canonical }) => {
          if (!sourceValues.has(canonical)) {
            return;
          }

          const value = sourceValues.get(canonical);

          if (record[name] === undefined || record[name] === null) {
            record[name] = value;
          }

          if (
            canonical &&
            canonical !== name &&
            (record[canonical] === undefined || record[canonical] === null)
          ) {
            record[canonical] = value;
          }
        });

        if (valueColumns.some((column) => record[column] === undefined || record[column] === null)) {
          const match = findMatchingPivotRow(node.labels ?? []);
          if (match) {
            valueColumns.forEach((column) => {
              const canonicalColumn = canonicalizeKey(column);
              const matchValue =
                match[column] ??
                (canonicalColumn && canonicalColumn !== column ? match[canonicalColumn] : undefined);

              if (matchValue === undefined || matchValue === null) {
                return;
              }

              if (record[column] === undefined || record[column] === null) {
                record[column] = matchValue;
              }

              if (
                canonicalColumn &&
                canonicalColumn !== column &&
                (record[canonicalColumn] === undefined || record[canonicalColumn] === null)
              ) {
                record[canonicalColumn] = matchValue;
              }
            });
          }
        }
      } else {
        // Set value columns to empty/null when includeValues is false
        valueColumns.forEach((column) => {
          record[column] = null;
          const canonicalColumn = canonicalizeKey(column);
          if (canonicalColumn && canonicalColumn !== column) {
            record[canonicalColumn] = null;
          }
        });
      }

      return record;
    },
    [canonicalizeKey, findMatchingPivotRow, normalizedValueColumns, rowFields, valueColumns],
  );

  const isRowGrandTotal = useCallback(
    (row: Record<string, any>) => {
      // Only detect Grand Total rows, not subtotal rows
      // Grand Total rows contain "Grand Total" in their field values
      const isGrandTotalString = (value: unknown) => {
        if (typeof value !== 'string') return false;
        const normalized = value.trim().toLowerCase();
        return normalized.includes('grand total') || normalized === 'grandtotal';
      };
      if (rowFields.length > 0) {
        return rowFields.some((field) => isGrandTotalString(row[field]));
      }
      const firstColumn = columns[0];
      if (!firstColumn) {
        return false;
      }
      return isGrandTotalString(row[firstColumn]);
    },
    [columns, rowFields]
  );

  const isColumnGrandTotal = useCallback(
    (column: string) => column?.toLowerCase().includes('grand total'),
    []
  );

  const getDataCellStyle = useCallback(
    (params: {
      row: Record<string, any>;
      column: string;
      rowIndex: number;
      isRowHeader: boolean;
    }): React.CSSProperties => {
      const { row, column, rowIndex, isRowHeader } = params;
      const columnIsTotal = isColumnGrandTotal(column);
      const rowIsTotal = isRowGrandTotal(row);

      let backgroundColor = themeColors.rowBg;
      let color = themeColors.rowText;
      let fontWeight: number | undefined;

      if (styleOptions.bandedRows && rowIndex % 2 === 1 && !rowIsTotal) {
        backgroundColor = themeColors.rowAltBg;
        color = themeColors.rowAltText;
      }

      if (styleOptions.rowHeaders && isRowHeader && !rowIsTotal) {
        backgroundColor = themeColors.rowHeaderBg;
        color = themeColors.rowHeaderText;
        fontWeight = 600;
      }

      if (columnIsTotal) {
        backgroundColor = themeColors.totalColumnBg;
        color = themeColors.totalColumnText;
        fontWeight = 700;
      }

      if (rowIsTotal) {
        backgroundColor = themeColors.totalRowBg;
        color = themeColors.totalRowText;
        fontWeight = 700;
      }

      return {
        backgroundColor,
        color,
        borderColor,
        fontWeight,
      };
    },
    [
      borderColor,
      isColumnGrandTotal,
      isRowGrandTotal,
      styleOptions.bandedRows,
      styleOptions.rowHeaders,
      themeColors.rowAltBg,
      themeColors.rowAltText,
      themeColors.rowBg,
      themeColors.rowHeaderBg,
      themeColors.rowHeaderText,
      themeColors.rowText,
      themeColors.totalColumnBg,
      themeColors.totalColumnText,
      themeColors.totalRowBg,
      themeColors.totalRowText,
    ]
  );

  const percentageMode = data.percentageMode ?? 'off';
  const percentageDecimals = data.percentageDecimals ?? 2;

  // Calculate totals for percentage calculations
  const calculateTotals = useMemo(() => {
    if (percentageMode === 'off' || !hasResults) {
      return { rowTotals: new Map(), columnTotals: new Map(), grandTotal: 0, hierarchyRowTotals: new Map() };
    }

    const rowTotals = new Map<string, number>();
    const columnTotals = new Map<string, number>();
    const hierarchyRowTotals = new Map<string, number>();
    let grandTotal = 0;

    // Filter out "Grand Total" columns from percentage calculations
    // Grand Total columns are calculated columns and shouldn't be included in totals
    const isGrandTotalColumn = (column: string) => {
      const normalized = column.toLowerCase();
      return normalized.includes('grand total') || normalized === 'grandtotal';
    };

    // For row totals: exclude Grand Total columns
    const columnsForRowCalculation = valueColumns.filter((col) => !isGrandTotalColumn(col));
    
    // For column totals: include Grand Total columns only when in column percentage mode
    // (so we can calculate percentages for them, but exclude them from row totals)
    const columnsForColumnCalculation = percentageMode === 'column' 
      ? valueColumns  // Include all columns including Grand Total columns
      : columnsForRowCalculation;  // Exclude Grand Total columns for other modes

    // Calculate row totals and column totals from raw pivot data
    pivotRows.forEach((row) => {
      // Check if this is a Grand Total row - exclude it from column totals calculation
      // Grand Total rows contain the sum of all rows, so including them would double-count
      const isGrandTotalRow = isRowGrandTotal(row);
      
      let rowTotal = 0;
      const rowKey = rowFields
        .map((field) => canonicalizeKey(getRowFieldValue(row, field)))
        .join('|');

      // Additional check: only check for "grand total" in rowKey (not just "total" which could be a subtotal)
      const rowKeyLower = rowKey.toLowerCase();
      const isRowKeyGrandTotal = rowKeyLower.includes('grand total') || 
                                rowKeyLower.includes('grandtotal');
      const isActuallyGrandTotalRow = isGrandTotalRow || isRowKeyGrandTotal;

      // Calculate row totals: only sum actual value columns, exclude Grand Total columns
      columnsForRowCalculation.forEach((column) => {
        const canonicalColumn = canonicalizeKey(column);
        const cellValue =
          row[column] ??
          (canonicalColumn && canonicalColumn !== column ? row[canonicalColumn] : undefined);

        if (typeof cellValue === 'number' && Number.isFinite(cellValue)) {
          rowTotal += cellValue;
        }
      });

      // Calculate column totals: include Grand Total columns for column percentage mode
      // But exclude Grand Total rows to avoid double-counting
      if (!isActuallyGrandTotalRow) {
        columnsForColumnCalculation.forEach((column) => {
          const canonicalColumn = canonicalizeKey(column);
          const cellValue =
            row[column] ??
            (canonicalColumn && canonicalColumn !== column ? row[canonicalColumn] : undefined);

          if (typeof cellValue === 'number' && Number.isFinite(cellValue)) {
            const currentColumnTotal = columnTotals.get(column) || 0;
            columnTotals.set(column, currentColumnTotal + cellValue);
            
            // Only add to grandTotal if it's not a Grand Total column
            // (Grand Total columns are calculated, not source data)
            if (!isGrandTotalColumn(column)) {
              grandTotal += cellValue;
            }
          }
        });
      }

      if (rowTotal > 0) {
        rowTotals.set(rowKey, rowTotal);
      }
    });

    // Also calculate from hierarchy nodes for hierarchical layouts
    const rawHierarchy = Array.isArray(data.pivotHierarchy) ? data.pivotHierarchy : [];
    if (rawHierarchy.length > 0) {
      const isGrandTotalColumn = (column: string) => {
        const normalized = column.toLowerCase();
        return normalized.includes('grand total') || normalized === 'grandtotal';
      };
      const columnsForCalculation = valueColumns.filter((col) => !isGrandTotalColumn(col));

      rawHierarchy.forEach((raw: any) => {
        const nodeKey = raw?.key;
        if (!nodeKey) return;
        
        let nodeRowTotal = 0;
        const nodeValues = raw?.values ?? {};
        // Only sum actual value columns, exclude Grand Total columns
        columnsForCalculation.forEach((column) => {
          const value = nodeValues[column];
          if (typeof value === 'number' && Number.isFinite(value)) {
            nodeRowTotal += value;
          }
        });
        if (nodeRowTotal > 0) {
          hierarchyRowTotals.set(nodeKey, nodeRowTotal);
        }
      });
    }

    return { rowTotals, columnTotals, grandTotal, hierarchyRowTotals };
  }, [percentageMode, pivotRows, valueColumns, rowFields, hasResults, canonicalizeKey, getRowFieldValue, data.pivotHierarchy, isRowGrandTotal]);

  const getPercentageValue = useCallback(
    (cellValue: unknown, rowKey: string, column: string, row?: Record<string, any>): number | null => {
      if (percentageMode === 'off') {
        return null;
      }

      if (typeof cellValue !== 'number' || !Number.isFinite(cellValue)) {
        return null;
      }

      const { rowTotals, columnTotals, grandTotal, hierarchyRowTotals } = calculateTotals;

      // Check if this is a Grand Total column
      const isGrandTotalCol = column?.toLowerCase().includes('grand total') || column?.toLowerCase() === 'grandtotal';
      
      // Check if this is a Grand Total row - use both row check and rowKey check for robustness
      // Only treat as Grand Total if it contains "Grand Total", not just "Total" (which could be a subtotal)
      const isGrandTotalRow = row ? isRowGrandTotal(row) : false;
      const rowKeyLower = rowKey?.toLowerCase() || '';
      const isRowKeyGrandTotal = rowKeyLower.includes('grand total') || 
                                 rowKeyLower.includes('grandtotal');
      const isActuallyGrandTotalRow = isGrandTotalRow || isRowKeyGrandTotal;

      if (percentageMode === 'row') {
        // Try hierarchy row totals first, then regular row totals
        const rowTotal = hierarchyRowTotals.get(rowKey) || rowTotals.get(rowKey);
        if (rowTotal && rowTotal !== 0) {
          // For Grand Total column in row percentage mode, it should always be 100%
          if (isGrandTotalCol) {
            return 100;
          }
          return (cellValue / rowTotal) * 100;
        }
      } else if (percentageMode === 'column') {
        if (isActuallyGrandTotalRow) {
          return 100;
        }
        
        // For regular rows: calculate percentage of column total
        const columnTotal = columnTotals.get(column);
        if (columnTotal && columnTotal !== 0) {
          return (cellValue / columnTotal) * 100;
        }
      } else if (percentageMode === 'grand_total') {
        if (grandTotal !== 0) {
          return (cellValue / grandTotal) * 100;
        }
      }

      return null;
    },
    [percentageMode, calculateTotals, isRowGrandTotal]
  );

  const formatValue = useCallback(
    (value: unknown, rowKey?: string, column?: string, row?: Record<string, any>) => {
    if (value === null || value === undefined) {
      return '-';
    }

      // Check if we should show percentage
      if (percentageMode !== 'off' && rowKey && column && typeof value === 'number') {
        const percentage = getPercentageValue(value, rowKey, column, row);
        if (percentage !== null) {
          return `${percentage.toFixed(percentageDecimals)}%`;
        }
      }

    if (typeof value === 'number') {
      return Number.isFinite(value) ? value.toLocaleString() : '-';
    }
    if (value instanceof Date) {
      return value.toLocaleString();
    }
    return String(value);
    },
    [percentageMode, percentageDecimals, getPercentageValue]
  );

  const renderLoadingRow = (colSpan: number) => (
    <TableRow style={{ borderColor }}>
      <TableCell colSpan={colSpan} className="text-center py-8" style={{ borderColor }}>
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" />
      </TableCell>
    </TableRow>
  );

  const renderEmptyRow = (colSpan: number, message: string) => (
    <TableRow style={{ borderColor }}>
      <TableCell
        colSpan={colSpan}
        className="text-center py-8 text-sm text-muted-foreground"
        style={{ borderColor }}
      >
        {message}
      </TableCell>
    </TableRow>
  );

  const renderTabularTable = (rowsToRender: TabularRow[] = tabularRows) => {
    const colSpan = Math.max(rowFields.length + valueColumns.length, 1);
    const headerRowCount = columnHeaderRows.length > 0 ? columnHeaderRows.length : 1;

    return (
      <Table style={tableStyle}>
        <TableHeader>
          {Array.from({ length: headerRowCount }).map((_, headerIndex) => (
            <TableRow key={`tabular-header-${headerIndex}`} style={{ borderColor }}>
              {headerIndex === 0 &&
                rowFields.map((field) => (
                  <TableHead
                    key={field}
                    rowSpan={headerRowCount}
                    className="text-left text-[12px] uppercase tracking-wide font-semibold"
                    style={{ ...headerStyle, textAlign: 'left' }}
                  >
                    {renderFieldHeaderWithSortFilter(field, true)}
                  </TableHead>
                ))}
              {columnHeaderRows.length > 0
                ? (columnHeaderRows[headerIndex] ?? []).map((cell) => (
                    <TableHead
                      key={`${cell.key}-${headerIndex}`}
                      colSpan={cell.colSpan}
                      rowSpan={cell.rowSpan}
                      className={getHeaderCellClass(cell)}
                      style={{
                        ...headerStyle,
                        textAlign: cell.isValueField ? 'right' : 'left',
                      }}
                    >
                      {cell.label}
                    </TableHead>
                  ))
                : headerIndex === 0
                ? valueColumns.map((column) => {
                    // Use valueFieldLabelMap to show aggregation labels (e.g., "Sum of D1")
                    const label = valueFieldLabelMap.get(column) || 
                                  valueFieldLabelMap.get(column.toLowerCase()) || 
                                  column;
                    return (
                    <TableHead
                      key={column}
                      className="text-right text-[12px] uppercase tracking-wide font-semibold"
                      style={headerStyle}
                    >
                        {label}
                    </TableHead>
                    );
                  })
                : null}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
            {isLoading
              ? renderLoadingRow(colSpan)
              : rowsToRender.length === 0
              ? renderEmptyRow(
                  colSpan,
                  'No pivot results yet. Configure the layout and refresh to generate the table.'
                )
              : rowsToRender.map((row, rowIndex) => (
                <TableRow key={`tabular-${rowIndex}`} style={{ borderColor }}>
                  {rowFields.map((field, fieldIndex) => {
                    const canonicalField = canonicalizeKey(field);
                    const cellValue =
                      row.record[field] ??
                      (canonicalField && canonicalField !== field
                        ? row.record[canonicalField]
                        : undefined) ??
                      '';

                    return (
                      <TableCell
                        key={`${rowIndex}-${field}`}
                        className={cn(
                          'text-left',
                          fieldIndex === 0 ? 'font-semibold' : 'font-medium'
                        )}
                        style={getDataCellStyle({
                          row: row.record,
                          column: field,
                          rowIndex,
                          isRowHeader: fieldIndex === 0,
                        })}
                      >
                        {cellValue}
                      </TableCell>
                    );
                  })}
                  {valueColumns.map((column) => {
                    const canonicalColumn = canonicalizeKey(column);
                    const record = row.record || {};
                    const rawValue =
                      record[column] ??
                      (canonicalColumn && canonicalColumn !== column
                        ? record[canonicalColumn]
                        : undefined);
                    
                    // Use nodeKey for subtotals (if available) to get correct percentage calculations
                    // Otherwise generate rowKey from record fields
                    const rowKey = row.nodeKey || (rowFields.length > 0
                      ? rowFields
                          .map((field) => canonicalizeKey(getRowFieldValue(record, field)))
                          .join('|')
                      : '');

                    return (
                      <TableCell
                        key={`${rowIndex}-${column}`}
                        className="text-right tabular-nums font-medium"
                        style={getDataCellStyle({
                          row: record,
                          column,
                          rowIndex,
                          isRowHeader: false,
                        })}
                      >
                        {formatValue(rawValue, rowKey, column, record)}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
        </TableBody>
      </Table>
    );
  };

  const renderCompactTable = (rowsToRender: CompactRow[] = compactRows) => {
    if (!rowFields.length || rowsToRender.length === 0) {
      return renderTabularTable([]);
    }

    const headerRowCount = columnHeaderRows.length > 0 ? columnHeaderRows.length : 1;

    return (
      <Table style={tableStyle}>
        <TableHeader>
          {Array.from({ length: headerRowCount }).map((_, headerIndex) => (
            <TableRow key={`compact-header-${headerIndex}`} style={{ borderColor }}>
              {headerIndex === 0 && (
                <TableHead
                  rowSpan={headerRowCount}
                  className="text-left text-[12px] uppercase tracking-wide font-semibold"
                  style={headerStyle}
                >
                  <div
                    className="flex items-center justify-between"
                    style={{ color: headerStyle.color as string }}
                  >
                    <div className="flex items-center gap-0.5 group/header">
                      <span>Row Labels</span>
                      {rowFields.length > 0 && (() => {
                        const parentField = rowFields[0];
                        const sorting = data.pivotSorting?.[parentField] || 
                                       (data.pivotSorting ? Object.entries(data.pivotSorting).find(([k]) => k.toLowerCase() === parentField.toLowerCase())?.[1] : undefined);
                        const hasFilter = filterSelections[parentField] || filterSelections[getNormalizedKey(parentField)];
                        const filterOptionsForField = getFilterOptions(parentField);
                        const filterSelectionsForField = getFilterSelections(parentField);
                        
                        return (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="opacity-60 group-hover/header:opacity-100 transition-opacity p-0.5 hover:bg-muted rounded flex items-center justify-center ml-0.5"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                }}
                                onMouseDown={(e) => e.stopPropagation()}
                              >
                                {sorting?.type === 'asc' || sorting?.type === 'value_asc' ? (
                                  <ArrowUp className="h-3.5 w-3.5 text-muted-foreground" />
                                ) : sorting?.type === 'desc' || sorting?.type === 'value_desc' ? (
                                  <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" />
                                ) : (
                                  <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                                )}
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuLabel className="text-[11px] uppercase tracking-wide">
                                Sort Options
                              </DropdownMenuLabel>
                              <DropdownMenuItem
                                onSelect={(e) => {
                                  e.preventDefault();
                                  handleSortChange(parentField, 'asc');
                                }}
                                className={cn(
                                  'text-xs',
                                  sorting?.type === 'asc' ? 'font-semibold text-primary' : '',
                                )}
                              >
                                <ArrowUp className="h-3 w-3 mr-2" />
                                Sort A → Z
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={(e) => {
                                  e.preventDefault();
                                  handleSortChange(parentField, 'desc');
                                }}
                                className={cn(
                                  'text-xs',
                                  sorting?.type === 'desc' ? 'font-semibold text-primary' : '',
                                )}
                              >
                                <ArrowDown className="h-3 w-3 mr-2" />
                                Sort Z → A
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={(e) => {
                                  e.preventDefault();
                                  handleSortChange(parentField, 'value_asc');
                                }}
                                className={cn(
                                  'text-xs',
                                  sorting?.type === 'value_asc' ? 'font-semibold text-primary' : '',
                                )}
                              >
                                <ArrowUp className="h-3 w-3 mr-2" />
                                Sort by Value (Ascending)
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={(e) => {
                                  e.preventDefault();
                                  handleSortChange(parentField, 'value_desc');
                                }}
                                className={cn(
                                  'text-xs',
                                  sorting?.type === 'value_desc' ? 'font-semibold text-primary' : '',
                                )}
                              >
                                <ArrowDown className="h-3 w-3 mr-2" />
                                Sort by Value (Descending)
                              </DropdownMenuItem>
                              {sorting && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onSelect={(e) => {
                                      e.preventDefault();
                                      handleSortChange(parentField, null);
                                    }}
                                    className="text-xs"
                                  >
                                    Clear Sort
                                  </DropdownMenuItem>
                                </>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onSelect={(e) => {
                                  e.preventDefault();
                                  handleFilterModalOpen(parentField);
                                }}
                                className={cn(
                                  'text-xs',
                                  hasFilter ? 'font-semibold text-primary' : '',
                                )}
                              >
                                <Filter className="h-3 w-3 mr-2" />
                                Filter...
                                {hasFilter && filterSelectionsForField.length < filterOptionsForField.length && (
                                  <span className="ml-auto text-[10px]">
                                    ({filterSelectionsForField.length} selected)
                                  </span>
                                )}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        );
                      })()}
                    </div>
                  </div>
                </TableHead>
              )}
              {columnHeaderRows.length > 0
                ? (columnHeaderRows[headerIndex] ?? []).map((cell) => (
                    <TableHead
                      key={`${cell.key}-${headerIndex}`}
                      colSpan={cell.colSpan}
                      rowSpan={cell.rowSpan}
                      className={getHeaderCellClass(cell)}
                      style={{
                        ...headerStyle,
                        textAlign: cell.isValueField ? 'right' : 'left',
                      }}
                    >
                      {cell.label}
                    </TableHead>
                  ))
                : headerIndex === 0
                ? valueColumns.map((column) => {
                    // Use valueFieldLabelMap to show aggregation labels (e.g., "Sum of D1")
                    const label = valueFieldLabelMap.get(column) || 
                                  valueFieldLabelMap.get(column.toLowerCase()) || 
                                  column;
                    return (
                    <TableHead
                      key={column}
                      className="text-right text-[12px] uppercase tracking-wide font-semibold"
                      style={headerStyle}
                    >
                        {label}
                    </TableHead>
                    );
                  })
                : null}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
            {isLoading
              ? renderLoadingRow(Math.max(1 + valueColumns.length, 1))
              : rowsToRender.map((row, rowIndex) => {
                const cellStyle = getDataCellStyle({
                  row: row.record,
                  column: 'Row Labels',
                  rowIndex,
                  isRowHeader: true,
                });
                return (
                  <TableRow
                    key={`${row.node.key}-${row.isTotal ? 'total' : 'value'}`}
                    style={{ borderColor }}
                  >
                    <TableCell
                      className={cn(
                        'text-left font-semibold',
                        row.isTotal ? 'italic' : undefined,
                      )}
                      style={{ ...cellStyle, borderColor }}
                    >
                      <div
                        className="flex items-center gap-2"
                        style={{ paddingLeft: `${Math.max(row.depth, 0) * 16}px` }}
                      >
                        {row.hasChildren ? (
                          <button
                            type="button"
                            className="flex h-5 w-5 items-center justify-center rounded hover:bg-muted"
                            onClick={() => onToggleCollapse(row.node.key)}
                            aria-label={collapsedSet.has(row.node.key) ? 'Expand group' : 'Collapse group'}
                          >
                            {collapsedSet.has(row.node.key) ? (
                              <PlusSquare className="h-3.5 w-3.5" />
                            ) : (
                              <MinusSquare className="h-3.5 w-3.5" />
                            )}
                          </button>
                        ) : (
                          <span className="w-3.5" />
                        )}
                        <span>{row.label}</span>
                      </div>
                    </TableCell>
                    {valueColumns.map((column) => {
                      const rowKey = row.node?.key || '';
                      const columnValue = row.record?.[column];
                      return (
                      <TableCell
                        key={`${row.node?.key || rowIndex}-${column}`}
                        className="text-right tabular-nums"
                        style={getDataCellStyle({
                          row: row.record || {},
                          column,
                          rowIndex,
                          isRowHeader: false,
                        })}
                      >
                          {formatValue(columnValue, rowKey, column, row.record || {})}
                      </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
        </TableBody>
      </Table>
    );
  };

  const renderOutlineTable = (rowsToRender: OutlineRow[] = outlineRows) => {
    if (!rowFields.length || rowsToRender.length === 0) {
      return renderTabularTable([]);
    }

    const colSpan = Math.max(rowFields.length + valueColumns.length, 1);
    const headerRowCount = columnHeaderRows.length > 0 ? columnHeaderRows.length : 1;

    return (
      <Table style={tableStyle}>
        <TableHeader>
          {Array.from({ length: headerRowCount }).map((_, headerIndex) => (
            <TableRow key={`outline-header-${headerIndex}`} style={{ borderColor }}>
              {headerIndex === 0 &&
                rowFields.map((field) => (
                  <TableHead
                    key={field}
                    rowSpan={headerRowCount}
                    className="text-left text-[12px] uppercase tracking-wide font-semibold"
                    style={{ ...headerStyle, textAlign: 'left' }}
                  >
                    {renderFieldHeaderWithSortFilter(field, true)}
                  </TableHead>
                ))}
              {columnHeaderRows.length > 0
                ? (columnHeaderRows[headerIndex] ?? []).map((cell) => (
                    <TableHead
                      key={`${cell.key}-${headerIndex}`}
                      colSpan={cell.colSpan}
                      rowSpan={cell.rowSpan}
                      className={getHeaderCellClass(cell)}
                      style={{
                        ...headerStyle,
                        textAlign: cell.isValueField ? 'right' : 'left',
                      }}
                    >
                      {cell.label}
                    </TableHead>
                  ))
                : headerIndex === 0
                ? valueColumns.map((column) => (
                    <TableHead
                      key={column}
                      className="text-right text-[12px] uppercase tracking-wide font-semibold"
                      style={headerStyle}
                    >
                      {column}
                    </TableHead>
                  ))
                : null}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
            {isLoading
              ? renderLoadingRow(colSpan)
              : rowsToRender.map((row, rowIndex) => (
                <TableRow key={`${row.node.key}-outline${row.isTotal ? '-total' : ''}`} style={{ borderColor }}>
                  {rowFields.map((field, fieldIndex) => {
                    const isLevelCell = fieldIndex === row.level;
                    const cellStyle = getDataCellStyle({
                      row: row.record,
                      column: field,
                      rowIndex,
                      isRowHeader: fieldIndex === 0,
                    });
                    const cellValue = row.display[field] ?? '';
                    const showToggle = isLevelCell && row.hasChildren && !row.isTotal;
                    const isCollapsed = collapsedSet.has(row.node.key);

                    return (
                      <TableCell
                        key={`${row.node.key}-${field}-${row.isTotal ? 'total' : 'value'}`}
                        className={cn(
                          'text-left',
                          fieldIndex === 0 ? 'font-semibold' : 'font-medium'
                        )}
                        style={cellStyle}
                      >
                        {isLevelCell ? (
                          <div className="flex items-center gap-2">
                            {showToggle ? (
                              <button
                                type="button"
                                className="flex h-5 w-5 items-center justify-center rounded hover:bg-muted"
                                onClick={() => onToggleCollapse(row.node.key)}
                                aria-label={isCollapsed ? 'Expand group' : 'Collapse group'}
                              >
                                {isCollapsed ? (
                                  <PlusSquare className="h-3.5 w-3.5" />
                                ) : (
                                  <MinusSquare className="h-3.5 w-3.5" />
                                )}
                              </button>
                            ) : row.hasChildren && !row.isTotal ? (
                              <span className="w-3.5" />
                            ) : null}
                            <span>{cellValue}</span>
                          </div>
                        ) : (
                          cellValue
                        )}
                      </TableCell>
                    );
                  })}
                  {valueColumns.map((column) => {
                    const rowKey = row.node?.key || '';
                    const record = row.record || {};
                    const columnValue = record[column];
                    return (
                    <TableCell
                      key={`${row.node?.key || rowIndex}-${column}-${row.isTotal ? 'total' : 'value'}`}
                      className="text-right tabular-nums font-medium"
                      style={getDataCellStyle({
                        row: record,
                        column,
                        rowIndex,
                        isRowHeader: false,
                      })}
                    >
                        {formatValue(columnValue, rowKey, column, record)}
                    </TableCell>
                    );
                  })}
                </TableRow>
              ))}
        </TableBody>
      </Table>
    );
  };

  type HierNode = {
    key: string;
    parentKey: string | null;
    level: number;
    order: number;
    labels: Array<{ field: string; value: any }>;
    values: Record<string, any>;
    children: HierNode[];
  };

  const hierarchyTree = useMemo(() => {
    const rawNodes = Array.isArray(data.pivotHierarchy) ? data.pivotHierarchy : [];
    const nodeMap = new Map<string, HierNode>();

    rawNodes.forEach((raw: any) => {
      const key = typeof raw?.key === 'string' && raw.key.length > 0 ? raw.key : String(raw?.key ?? '');
      if (!key) {
        return;
      }
      const node: HierNode = {
        key,
        parentKey: raw?.parent_key ?? null,
        level: Number(raw?.level ?? 0),
        order: Number(raw?.order ?? 0),
        labels: Array.isArray(raw?.labels) ? raw.labels : [],
        values: raw?.values ?? {},
        children: [],
      };
      nodeMap.set(key, node);
    });

    const roots: HierNode[] = [];
    nodeMap.forEach((node) => {
      const parentKey = node.parentKey;
      if (parentKey && nodeMap.has(parentKey)) {
        nodeMap.get(parentKey)!.children.push(node);
      } else {
        roots.push(node);
      }
    });

    const sortRecursive = (items: HierNode[]) => {
      items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      items.forEach((child) => sortRecursive(child.children));
    };
    sortRecursive(roots);

    return { roots, nodeMap };
  }, [data.pivotHierarchy]);

  type CompactRow = {
    node: HierNode;
    depth: number;
    label: string;
    record: Record<string, any>;
    hasChildren: boolean;
    isTotal: boolean;
  };

  // Helper to check if a node is a Grand Total node
  const isGrandTotalNode = useCallback((node: HierNode): boolean => {
    if (node.key === '__grand_total__') {
      return true;
    }
    const labelEntry = node.labels?.[node.labels.length - 1];
    const labelValue = labelEntry?.value ?? '';
    if (typeof labelValue === 'string') {
      const normalized = labelValue.trim().toLowerCase();
      return normalized.includes('grand total') || normalized === 'grandtotal';
    }
    return false;
  }, []);

  const compactRows = useMemo<CompactRow[]>(() => {
    if (!rowFields.length || hierarchyTree.roots.length === 0) {
      return [];
    }

    const rows: CompactRow[] = [];
    const showSubtotals = subtotalsMode !== 'off';

    const pushNode = (node: HierNode, ancestorCollapsed: boolean) => {
      const labelEntry = node.labels?.[node.labels.length - 1];
      const labelValue = labelEntry?.value ?? '';
      const nodeHasChildren = node.children.length > 0;
      const isCollapsed = collapsedSet.has(node.key) && nodeHasChildren;
      const shouldShowSubtotals = showSubtotals && nodeHasChildren;

      // Determine if parent node should have values
      // - subtotals off: parent nodes have empty values
      // - subtotals top: parent nodes have values (subtotals)
      // - subtotals bottom: parent nodes have empty values (totals shown separately at bottom)
      const parentHasValues = nodeHasChildren && subtotalsMode === 'top';
      const includeValues = !nodeHasChildren || parentHasValues;
      
      const record = buildRecordForNode(node, includeValues);

      const createTotalRow = () => {
        const fieldName = rowFields[node.level] ?? rowFields[0];
        // Total row always has values (subtotals)
        const totalRecord = buildRecordForNode(node, true);
        let totalLabel = String(labelValue ?? '').trim();

        if (!totalLabel && fieldName) {
          const baseValue = String(totalRecord[fieldName] ?? '').trim();
          totalLabel = baseValue;
        }

        if (totalLabel.length > 0 && !totalLabel.toLowerCase().endsWith('total')) {
          totalLabel = `${totalLabel} Total`;
        }

        if (!totalLabel) {
          totalLabel = 'Total';
        }

        if (fieldName) {
          const base = String(totalRecord[fieldName] ?? '').trim();
          const totalFieldLabel =
            base.length > 0 && !base.toLowerCase().endsWith('total')
              ? `${base} Total`
              : base || totalLabel;
          totalRecord[fieldName] = totalFieldLabel;
        }

        const totalRow: CompactRow = {
          node,
          depth: node.level,
          label: totalLabel,
          record: totalRecord,
          hasChildren: false,
          isTotal: true,
        };

        return totalRow;
      };

      if (!ancestorCollapsed) {
        // Always show parent nodes
        // - subtotals off: parent nodes have empty values
        // - subtotals top: parent nodes have values (subtotals) - no separate total row needed
        // - subtotals bottom: parent nodes have empty values (totals shown separately at bottom)
        rows.push({
          node,
          depth: node.level,
          label: String(labelValue ?? ''),
          record,
          hasChildren: nodeHasChildren,
          isTotal: false,
        });
      }

      const nextAncestorCollapsed = ancestorCollapsed || isCollapsed;
      node.children.forEach((child) => pushNode(child, nextAncestorCollapsed));

      // When subtotals are bottom, add a total row after children
      if (
        !ancestorCollapsed &&
        shouldShowSubtotals &&
        subtotalsMode === 'bottom' &&
        !isCollapsed
      ) {
        rows.push(createTotalRow());
      }
    };

    hierarchyTree.roots.forEach((root) => pushNode(root, false));

    // Separate Grand Total rows and place them at the end
    const regularRows: CompactRow[] = [];
    const grandTotalRows: CompactRow[] = [];
    
    rows.forEach((row) => {
      if (isGrandTotalNode(row.node)) {
        grandTotalRows.push(row);
      } else {
        regularRows.push(row);
      }
    });

    return [...regularRows, ...grandTotalRows];
  }, [
    buildRecordForNode,
    collapsedSet,
    hierarchyTree,
    rowFields,
    subtotalsMode,
    isGrandTotalNode,
  ]);

  type OutlineRow = {
    node: HierNode;
    record: Record<string, any>;
    display: Record<string, any>;
    level: number;
    hasChildren: boolean;
    isTotal: boolean;
  };

  const outlineRows = useMemo<OutlineRow[]>(() => {
    if (!rowFields.length || hierarchyTree.roots.length === 0) {
      return [];
    }
    const rows: OutlineRow[] = [];
    const showSubtotals = subtotalsMode !== 'off';

    const visit = (node: HierNode, ancestorCollapsed: boolean) => {
      const nodeHasChildren = node.children.length > 0;
      const isCollapsed = collapsedSet.has(node.key) && nodeHasChildren;
      const shouldShowSubtotals = showSubtotals && nodeHasChildren;

      // Determine if parent node should have values
      // - subtotals off: parent nodes have empty values
      // - subtotals top: parent nodes have values (subtotals)
      // - subtotals bottom: parent nodes have empty values (totals shown separately at bottom)
      const parentHasValues = nodeHasChildren && subtotalsMode === 'top';
      const includeValues = !nodeHasChildren || parentHasValues;
      
      const record = buildRecordForNode(node, includeValues);
      const display: Record<string, any> = {};
      rowFields.forEach((field, index) => {
        display[field] = index === node.level ? record[field] : '';
      });

      const createTotalRow = () => {
        const fieldName = rowFields[node.level] ?? rowFields[0];
        // Total row always has values (subtotals)
        const totalRecord = buildRecordForNode(node, true);
        const totalDisplay: Record<string, any> = {};
        rowFields.forEach((field, index) => {
          totalDisplay[field] = index === node.level ? totalRecord[field] : '';
        });
        
        if (fieldName) {
          const base = String(totalRecord[fieldName] ?? '').trim();
          const totalLabel = base.length > 0 && !base.toLowerCase().endsWith('total')
            ? `${base} Total`
            : base;
          totalRecord[fieldName] = totalLabel;
          totalDisplay[fieldName] = totalLabel;
        }
        rows.push({
          node,
          record: totalRecord,
          display: totalDisplay,
          level: node.level,
          hasChildren: false,
          isTotal: true,
        });
      };

      if (!ancestorCollapsed) {
        // Always show parent nodes
        // - subtotals off: parent nodes have empty values
        // - subtotals top: parent nodes have values (subtotals) - no separate total row needed
        // - subtotals bottom: parent nodes have empty values (totals shown separately at bottom)
        rows.push({
          node,
          record,
          display,
          level: node.level,
          hasChildren: nodeHasChildren,
          isTotal: false,
        });
      }

      const nextAncestorCollapsed = ancestorCollapsed || isCollapsed;
      node.children.forEach((child) => visit(child, nextAncestorCollapsed));

      // When subtotals are bottom, add a total row after children
      if (
        !ancestorCollapsed &&
        shouldShowSubtotals &&
        subtotalsMode === 'bottom' &&
        !isCollapsed
      ) {
        createTotalRow();
      }
    };

    hierarchyTree.roots.forEach((root) => visit(root, false));
    
    // Separate Grand Total rows and place them at the end
    const regularRows: OutlineRow[] = [];
    const grandTotalRows: OutlineRow[] = [];
    
    rows.forEach((row) => {
      if (isGrandTotalNode(row.node)) {
        grandTotalRows.push(row);
      } else {
        regularRows.push(row);
      }
    });

    return [...regularRows, ...grandTotalRows];
  }, [
    buildRecordForNode,
    collapsedSet,
    hierarchyTree,
    rowFields,
    subtotalsMode,
    isGrandTotalNode,
  ]);

  type TabularRow = {
    record: Record<string, any>;
    nodeKey?: string; // Store node key for subtotals to calculate percentages correctly
  };

  const tabularRows = useMemo<TabularRow[]>(() => {
    if (!rowFields.length || hierarchyTree.roots.length === 0) {
      // No hierarchy - process flat rows and ensure grand total is last
      const regularRows: TabularRow[] = [];
      const grandTotalRows: TabularRow[] = [];
      
      pivotRows.forEach((row) => {
        const record: Record<string, any> = { ...row };

        valueColumns.forEach((column) => {
          const canonicalColumn = canonicalizeKey(column);
          const columnValue = row[column];
          if (
            canonicalColumn &&
            canonicalColumn !== column &&
            columnValue !== undefined &&
            columnValue !== null &&
            record[canonicalColumn] === undefined
          ) {
            record[canonicalColumn] = columnValue;
          }
        });

        rowFields.forEach((field) => {
          const canonicalField = canonicalizeKey(field);
          const value = row[field];
          record[field] = value;
          if (
            canonicalField &&
            canonicalField !== field &&
            record[canonicalField] === undefined
          ) {
            record[canonicalField] = value;
          }
        });

        // Check if this is a Grand Total row
        const isGrandTotal = rowFields.some((field) => {
          const value = record[field];
          if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase();
            return normalized.includes('grand total') || normalized === 'grandtotal';
          }
          return false;
        });

        if (isGrandTotal) {
          grandTotalRows.push(row);
        } else {
          regularRows.push(row);
        }
      });

      return [...regularRows, ...grandTotalRows];
    }

    const rows: TabularRow[] = [];

    const traverse = (node: HierNode, path: Record<string, any>) => {
      const nextPath = { ...path };
      node.labels?.forEach(({ field, value }) => {
        nextPath[field] = value;
        nextPath[canonicalizeKey(field)] = value;
      });

      const nodeHasChildren = node.children.length > 0;
      
      // Determine if parent node should have values
      // - subtotals off: parent nodes have empty values
      // - subtotals top: parent nodes have values (subtotals)
      // - subtotals bottom: parent nodes have empty values (totals shown separately at bottom)
      const parentHasValues = nodeHasChildren && subtotalsMode === 'top';
      const includeValues = !nodeHasChildren || parentHasValues;
      
      const record = buildRecordForNode(node, includeValues);
      rowFields.forEach((field, index) => {
        const canonicalField = canonicalizeKey(field);
        let displayValue = nextPath[field];
        if (displayValue === undefined) {
          displayValue = nextPath[canonicalField];
        }
        if (displayValue === undefined) {
          displayValue = '';
        }
        // Only add "Total" suffix if subtotals are enabled and showing at bottom
        if (subtotalsMode === 'bottom' && nodeHasChildren && index === node.level && typeof displayValue === 'string') {
          const trimmed = displayValue.trim();
          displayValue = trimmed.length > 0 && !trimmed.toLowerCase().endsWith('total')
            ? `${trimmed} Total`
            : trimmed;
        }
        record[field] = displayValue;
        if (
          canonicalField &&
          canonicalField !== field &&
          (record[canonicalField] === undefined || record[canonicalField] === null)
        ) {
          record[canonicalField] = displayValue;
        }
      });

      if (node.children.length === 0) {
        // Leaf node - always include
        rows.push({ record, nodeKey: node.key });
        return;
      }

      // Always add parent node as a row (before children for tabular layout)
      // - subtotals off: parent nodes have empty values
      // - subtotals top: parent nodes have values (subtotals)
      // - subtotals bottom: parent nodes have empty values (totals shown separately at bottom)
      rows.push({ record, nodeKey: node.key });
      
      // Node has children - process children
      node.children.forEach((child) => traverse(child, nextPath));
      
      // When subtotals are bottom, add a total row after all children
      if (subtotalsMode === 'bottom') {
        const totalRecord = buildRecordForNode(node, true);
        rowFields.forEach((field, index) => {
          const canonicalField = canonicalizeKey(field);
          let displayValue = nextPath[field];
          if (displayValue === undefined) {
            displayValue = nextPath[canonicalizeKey(field)];
          }
          if (displayValue === undefined) {
            displayValue = '';
          }
          if (index === node.level && typeof displayValue === 'string') {
            const trimmed = displayValue.trim();
            displayValue = trimmed.length > 0 && !trimmed.toLowerCase().endsWith('total')
              ? `${trimmed} Total`
              : trimmed;
          }
          totalRecord[field] = displayValue;
          if (
            canonicalField &&
            canonicalField !== field &&
            (totalRecord[canonicalField] === undefined || totalRecord[canonicalField] === null)
          ) {
            totalRecord[canonicalField] = displayValue;
          }
        });
        rows.push({ record: totalRecord, nodeKey: node.key });
      }
    };

    hierarchyTree.roots.forEach((root) => traverse(root, {}));
    
    // Separate Grand Total rows and place them at the end
    const regularRows: TabularRow[] = [];
    const grandTotalRows: TabularRow[] = [];
    
    rows.forEach((row) => {
      // Check if this is a Grand Total row by checking if any field value contains "Grand Total"
      const isGrandTotal = rowFields.some((field) => {
        const value = row.record[field];
        if (typeof value === 'string') {
          const normalized = value.trim().toLowerCase();
          return normalized.includes('grand total') || normalized === 'grandtotal';
        }
        return false;
      });
      
      if (isGrandTotal) {
        grandTotalRows.push(row);
      } else {
        regularRows.push(row);
      }
    });

    return [...regularRows, ...grandTotalRows];
  }, [buildRecordForNode, canonicalizeKey, hierarchyTree, pivotRows, rowFields, valueColumns, subtotalsMode]);

  const canUseHierarchicalLayouts = rowFields.length > 0 && hierarchyTree.roots.length > 0;

  // Get current rows count based on layout
  const getCurrentRowsCount = useCallback(() => {
    if (!canUseHierarchicalLayouts) {
      return tabularRows.length;
    }
    switch (reportLayout) {
      case 'compact':
        return compactRows.length;
      case 'outline':
        return outlineRows.length;
      case 'tabular':
      default:
        return tabularRows.length;
    }
  }, [canUseHierarchicalLayouts, reportLayout, tabularRows.length, compactRows.length, outlineRows.length]);

  // Pagination calculations
  const totalRows = getCurrentRowsCount();
  const totalPages = Math.max(1, Math.ceil(totalRows / ROWS_PER_PAGE));
  const startIndex = (currentPage - 1) * ROWS_PER_PAGE;
  const endIndex = startIndex + ROWS_PER_PAGE;

  // Reset to page 1 when data changes
  useEffect(() => {
    setCurrentPage(1);
  }, [totalRows, reportLayout]);

  const renderCurrentLayout = () => {
    // Don't render table if rowFields is empty - show readiness message instead
    if (!rowFields.length) {
      return renderTabularTable([]);
    }
    
    if (!canUseHierarchicalLayouts) {
      const paginatedTabularRows = tabularRows.slice(startIndex, endIndex);
      return renderTabularTable(paginatedTabularRows);
    }
    switch (reportLayout) {
      case 'compact':
        const paginatedCompactRows = compactRows.slice(startIndex, endIndex);
        return renderCompactTable(paginatedCompactRows);
      case 'outline':
        const paginatedOutlineRows = outlineRows.slice(startIndex, endIndex);
        return renderOutlineTable(paginatedOutlineRows);
      case 'tabular':
      default:
        const paginatedTabularRows = tabularRows.slice(startIndex, endIndex);
        return renderTabularTable(paginatedTabularRows);
    }
  };

  type LayoutOption = { id: 'compact' | 'outline' | 'tabular'; label: string };

  const layoutOptions: LayoutOption[] = useMemo(
    () => [
      { id: 'compact', label: 'Show in Compact Form' },
      { id: 'outline', label: 'Show in Outline Form' },
      { id: 'tabular', label: 'Show in Tabular Form' },
    ],
    [],
  );

  // Calculate max height for scrollable area (approximately 20 rows)
  const tableMaxHeight = useMemo(() => {
    const headerRowCount = columnHeaderRows.length > 0 ? columnHeaderRows.length : 1;
    const headerHeight = headerRowCount * 50; // ~50px per header row
    const rowHeight = 40; // ~40px per data row
    const maxVisibleRows = 20;
    return headerHeight + (maxVisibleRows * rowHeight);
  }, [columnHeaderRows.length]);

  React.useEffect(() => {
    if (!canUseHierarchicalLayouts && (reportLayout === 'compact' || reportLayout === 'outline')) {
      onReportLayoutChange('tabular');
    }
  }, [canUseHierarchicalLayouts, onReportLayoutChange, reportLayout]);

  return (
    <div className="w-full h-full bg-[#F3F3F3] flex flex-col overflow-hidden">
      <div className="p-3 space-y-3 flex-shrink-0">
        <Card className="bg-white border border-[#D9D9D9] rounded-md shadow-sm overflow-hidden">
          <div className="px-4 py-3 overflow-hidden">
            <div className="flex w-full flex-nowrap items-center gap-3 sm:gap-4 overflow-x-auto min-w-0 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
              <div className="flex flex-nowrap items-center gap-3 min-w-0 flex-shrink-0">
                <span className="text-xs font-semibold text-[#595959] tracking-wide uppercase whitespace-nowrap">Layout</span>
                <div className="flex flex-nowrap items-center gap-1 flex-shrink-0">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="px-3 text-[11px] font-medium text-[#3F3F3F] hover:bg-[#EBEBEB]"
                      >
                        <Grid3x3 className="w-3.5 h-3.5" />
                        <span className="whitespace-normal leading-tight text-left">Subtotals</span>
                        <ChevronDown className="w-3 h-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-64 py-1">
                      {[
                        { id: 'off', label: 'Do Not Show Subtotals' },
                        {
                          id: 'bottom',
                          label: 'Show All Subtotals at Bottom of Group',
                        },
                        {
                          id: 'top',
                          label: 'Show All Subtotals at Top of Group',
                        },
                      ].map((option) => {
                        const isActive = subtotalsMode === option.id;
                        return (
                          <DropdownMenuItem
                            key={option.id}
                            onSelect={(event) => {
                              event.preventDefault();
                              onSubtotalsChange(option.id as 'off' | 'top' | 'bottom');
                            }}
                            className={cn(
                              'text-xs py-2 flex items-center justify-between',
                              isActive ? 'font-semibold text-[#1A73E8]' : ''
                            )}
                          >
                            {option.label}
                            {isActive && (
                              <span className="text-[10px] uppercase tracking-wide">
                                Selected
                              </span>
                            )}
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="px-3 text-[11px] font-medium text-[#3F3F3F] hover:bg-[#EBEBEB]"
                      >
                        <Grid3x3 className="w-3.5 h-3.5" />
                        <span className="flex flex-col leading-tight text-left whitespace-normal">
                          <span>Grand</span>
                          <span>Totals</span>
                        </span>
                        <ChevronDown className="w-3 h-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56 py-1">
                      {[
                        { id: 'off', label: 'Off for Rows and Columns' },
                        { id: 'both', label: 'On for Rows and Columns' },
                        { id: 'columns', label: 'On for Rows Only' },
                        { id: 'rows', label: 'On for Columns Only' },
                      ].map((option) => {
                        const isActive = grandTotalsMode === option.id;
                        return (
                          <DropdownMenuItem
                            key={option.id}
                            onSelect={(event) => {
                              event.preventDefault();
                              onGrandTotalsChange(option.id as 'off' | 'rows' | 'columns' | 'both');
                            }}
                            className={cn(
                              'text-xs py-2 flex items-center justify-between',
                              isActive ? 'font-semibold text-[#1A73E8]' : ''
                            )}
                          >
                            {option.label}
                            {isActive && (
                              <span className="text-[10px] uppercase tracking-wide">
                                Selected
                              </span>
                            )}
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="px-3 text-[11px] font-medium text-[#3F3F3F] hover:bg-[#EBEBEB]"
                      >
                        <span className="flex flex-col leading-tight text-left whitespace-normal">
                          <span>Show</span>
                          <span>Values As</span>
                        </span>
                        <ChevronDown className="w-3 h-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56 py-1">
                      {[
                        { id: 'off', label: 'No Calculation' },
                        { id: 'row', label: '% of Row Total' },
                        { id: 'column', label: '% of Column Total' },
                        { id: 'grand_total', label: '% of Grand Total' },
                      ].map((option) => {
                        const isActive = percentageMode === option.id;
                        return (
                          <DropdownMenuItem
                            key={option.id}
                            onSelect={(event) => {
                              event.preventDefault();
                              onDataChange({ percentageMode: option.id as 'off' | 'row' | 'column' | 'grand_total' });
                            }}
                            className={cn(
                              'text-xs py-2 flex items-center justify-between',
                              isActive ? 'font-semibold text-[#1A73E8]' : ''
                            )}
                          >
                            {option.label}
                            {isActive && (
                              <span className="text-[10px] uppercase tracking-wide">
                                Selected
                              </span>
                            )}
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="px-3 text-[11px] font-medium text-[#3F3F3F] hover:bg-[#EBEBEB]"
                      >
                        <Layout className="w-3.5 h-3.5" />
                        <span className="flex flex-col leading-tight text-left whitespace-normal">
                          <span>Report</span>
                          <span>Layout</span>
                        </span>
                        <ChevronDown className="w-3 h-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56 py-1">
                      {layoutOptions.map((option) => {
                        const isActive = reportLayout === option.id;
                        const disabled = option.id !== 'tabular' && !canUseHierarchicalLayouts;
                        return (
                          <DropdownMenuItem
                            key={option.id}
                            disabled={disabled}
                            onSelect={(event) => {
                              event.preventDefault();
                              if (!disabled) {
                                onReportLayoutChange(option.id);
                              }
                            }}
                            className={cn(
                              'text-xs py-2 flex items-center justify-between',
                              isActive ? 'font-semibold text-[#1A73E8]' : ''
                            )}
                          >
                            {option.label}
                            {disabled ? (
                              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                Unavailable
                              </span>
                            ) : isActive ? (
                              <span className="text-[10px] uppercase tracking-wide">Active</span>
                            ) : null}
                          </DropdownMenuItem>
                        );
                      })}
                      <DropdownMenuItem className="border-t text-xs text-muted-foreground" disabled>
                        Repeat All Item Labels
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-2.5 text-[11px] font-medium text-[#3F3F3F] hover:bg-[#EBEBEB] flex-shrink-0"
                    >
                      <span className="flex flex-col leading-tight text-left whitespace-normal">
                        <span>Pivot</span>
                        <span>Options</span>
                      </span>
                      <ChevronDown className="w-3 h-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56 py-1">
                    <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Pivot Options
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuCheckboxItem
                      checked={styleOptions.rowHeaders}
                      onCheckedChange={(checked) =>
                        onStyleOptionsChange({
                          ...styleOptions,
                          rowHeaders: Boolean(checked),
                        })
                      }
                      className="text-xs"
                    >
                      Row Headers
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                      checked={styleOptions.columnHeaders}
                      onCheckedChange={(checked) =>
                        onStyleOptionsChange({
                          ...styleOptions,
                          columnHeaders: Boolean(checked),
                        })
                      }
                      className="text-xs"
                    >
                      Column Headers
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                      checked={styleOptions.bandedRows}
                      onCheckedChange={(checked) =>
                        onStyleOptionsChange({
                          ...styleOptions,
                          bandedRows: Boolean(checked),
                        })
                      }
                      className="text-xs"
                    >
                      Banded Rows
                    </DropdownMenuCheckboxItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-3 text-[11px] font-medium text-[#3F3F3F] hover:bg-[#EBEBEB] flex-shrink-0"
                    >
                      <span className="flex flex-col leading-tight text-left whitespace-normal">
                        <span>PivotTable</span>
                        <span>Styles</span>
                      </span>
                      <ChevronDown className="w-3 h-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-[500px] p-4 max-h-[600px] overflow-y-auto">
                    {PIVOT_THEME_GROUPS.map((group) => (
                      <div key={group.id} className="mb-6 last:mb-0">
                        <h4 className="text-sm font-semibold mb-3 text-foreground capitalize">
                          {group.label}
                        </h4>
                      <div className="grid grid-cols-4 gap-3">
                          {group.themes.map((theme) => {
                            const isActive = selectedStyleId === theme.id;
                            return (
                          <button
                                key={theme.id}
                                type="button"
                                onClick={() => onStyleChange(theme.id)}
                                className={cn(
                                  'relative group rounded-lg border-2 transition-all overflow-hidden text-left',
                                  isActive
                                ? 'border-primary ring-2 ring-primary/20 shadow-lg'
                                : 'border-border hover:border-primary/50 hover:shadow-md'
                                )}
                          >
                            <div className="p-2">
                              <div className="space-y-0.5">
                                    <div
                                      className="h-3 rounded-t border border-black/5"
                                      style={{ backgroundColor: theme.colors.headerBg }}
                                    />
                                    <div
                                      className="h-2 border-x border-black/5"
                                      style={{ backgroundColor: theme.colors.rowBg }}
                                    />
                                    <div
                                      className="h-2 border-x border-black/5"
                                      style={{ backgroundColor: theme.colors.rowAltBg }}
                                    />
                                    <div
                                      className="h-2 rounded-b border-x border-b border-black/5"
                                      style={{ backgroundColor: theme.colors.totalRowBg }}
                                    />
                              </div>
                                  <span className="mt-2 block text-xs font-medium text-foreground truncate">
                                    {theme.name}
                                  </span>
                            </div>
                                {isActive && (
                              <div className="absolute top-1 right-1 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                                <div className="w-2 h-2 bg-white rounded-full" />
                              </div>
                            )}
                          </button>
                            );
                          })}
                      </div>
                    </div>
                        ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                              </div>

              <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
              <Button
                onClick={onSaveAs}
                disabled={isSaving || !hasResults}
                  className="bg-blue-600 hover:bg-blue-700 text-white flex items-center space-x-2 px-4 flex-shrink-0"
              >
                {isSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span className="whitespace-nowrap">Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                      <span className="whitespace-nowrap">Save As</span>
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onRefresh}
                disabled={isLoading || !data.dataSource}
                  className="h-8 px-3 border-[#D0D0D0] text-[#1A73E8] hover:bg-[#E8F0FE] flex-shrink-0"
              >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
              </Button>
              </div>
                              </div>
                            </div>

          {(error || infoMessage || saveError) && (
            <div className="border-t border-border/60">
              {error && (
                <div className="flex items-start gap-2 bg-destructive/10 px-4 py-3 text-destructive">
                  <AlertTriangle className="h-4 w-4 mt-0.5" />
                  <p className="text-sm">{error}</p>
                              </div>
                            )}
              {!error && infoMessage && (
                <div className="flex items-start gap-2 bg-muted/30 px-4 py-3 text-muted-foreground">
                  <Info className="h-4 w-4 mt-0.5" />
                  <p className="text-sm">{infoMessage}</p>
                      </div>
              )}
              {saveError && (
                <div className="flex items-start gap-2 bg-destructive/10 px-4 py-3 text-destructive">
                  <AlertTriangle className="h-4 w-4 mt-0.5" />
                  <p className="text-sm">{saveError}</p>
              </div>
                            )}
            </div>
          )}
        </Card>
      </div>

      <div className="flex-1 min-h-0 p-3 pt-0">
        <div className="bg-white border border-[#D9D9D9] rounded-md overflow-hidden shadow-sm h-full flex flex-col">
        {filters.length > 0 && (
            <div className="bg-card border-b border-border flex-shrink-0">
            <div className="bg-accent/5 border-b border-border px-4 py-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 bg-[#FFEED9] px-2 py-1 rounded border border-[#E0E0E0]">
                  <Filter className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-semibold text-[#C25700]">Filters</span>
                </div>
                {filters.map((field) => {
                  const options = getFilterOptions(field);
                  const selections = getFilterSelections(field);

                  const handleSelectionChange = (nextSelections: string[]) => {
                    const normalized = getNormalizedKey(field);
                    onDataChange({
                      pivotFilterSelections: {
                        ...filterSelections,
                        [field]: nextSelections,
                        [normalized]: nextSelections,
                      },
                    });
                  };

                  return (
                    <div key={field} onMouseEnter={() => ensureFilterOptions(field)}>
                      <MultiSelectDropdown
                        identifierName={field}
                        placeholder={`Filter by ${field}`}
                        selectedValues={selections}
                        onSelectionChange={handleSelectionChange}
                        options={options.map((value) => ({ value, label: value }))}
                        showSelectAll={true}
                        showTrigger={true}
                        triggerClassName="h-7 px-3 text-xs font-medium rounded-full bg-[#E6F4EA] text-[#0B8043] border border-[#C6E6C9] hover:bg-[#D7EADB]"
                        disabled={loadingFilter === field}
                        maxHeight="200px"
                      />
                    </div>
                  );
                })}
            </div>
              </div>
            </div>
          )}
          <div 
            className="flex-1 min-h-0 overflow-y-auto overflow-x-auto"
            style={{
              maxHeight: `${tableMaxHeight}px`
            }}
          >
            {renderCurrentLayout()}
          </div>
          
          {/* Pagination - only show if more than 20 rows */}
          {totalRows > ROWS_PER_PAGE && (
            <div className="border-t border-border bg-white px-4 py-3 flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Showing {startIndex + 1} to {Math.min(endIndex, totalRows)} of {totalRows} rows
              </div>
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                      className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                  </PaginationItem>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    return (
                      <PaginationItem key={pageNum}>
                        <PaginationLink
                          onClick={() => setCurrentPage(pageNum)}
                          isActive={currentPage === pageNum}
                          className="cursor-pointer"
                        >
                          {pageNum}
                        </PaginationLink>
                      </PaginationItem>
                    );
                  })}
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                      className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </div>
      </div>

      {/* Filter Modal */}
      {filterModalField && (
        <PivotTableFilterModal
          open={!!filterModalField}
          onOpenChange={(open) => {
            if (!open) setFilterModalField(null);
          }}
          field={filterModalField}
          options={getFilterOptions(filterModalField)}
          selections={getFilterSelections(filterModalField)}
          onSelectionsChange={(selections) =>
            handleFilterSelectionsChange(filterModalField, selections)
          }
          isLoading={loadingFilter === filterModalField}
          error={filterErrors[filterModalField] ?? null}
        />
      )}
    </div>
  );
};

export default PivotTableCanvas;