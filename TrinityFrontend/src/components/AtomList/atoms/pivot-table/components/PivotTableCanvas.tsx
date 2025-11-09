import React, { useCallback, useMemo, useState } from 'react';
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
  Palette,
  PlusSquare,
  MinusSquare,
  Save,
  RefreshCcw,
} from 'lucide-react';
import { PivotTableSettings } from '@/components/LaboratoryMode/store/laboratoryStore';
import { SCOPE_SELECTOR_API } from '@/lib/api';

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
  const [filterSearch, setFilterSearch] = useState<Record<string, string>>({});
  const [loadingFilter, setLoadingFilter] = useState<string | null>(null);
  const [filterErrors, setFilterErrors] = useState<Record<string, string | null>>({});

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
  const grandTotalsMode = data.grandTotalsMode ?? 'both';
  const subtotalsMode = data.subtotalsMode ?? 'bottom';

  const getAggregationLabel = (aggregation?: string) => {
    const normalized = (aggregation ?? 'sum').toLowerCase();
    switch (normalized) {
      case 'sum':
        return 'Sum';
      case 'avg':
      case 'average':
      case 'mean':
        return 'Average';
      case 'count':
        return 'Count';
      case 'min':
        return 'Min';
      case 'max':
        return 'Max';
      case 'median':
        return 'Median';
      default:
        return normalized.length > 0
          ? `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`
          : 'Value';
    }
  };

  const valueFieldLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    const valueConfigs = Array.isArray(data.valueFields) ? data.valueFields : [];
    valueConfigs.forEach((item) => {
      if (!item?.field) {
        return;
      }
      const label = `${getAggregationLabel(item.aggregation)} of ${item.field}`;
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
      items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
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
      if (isValueField) {
        const normalizedLabel = String(labelValue ?? '').toLowerCase();
        labelValue =
          valueFieldLabelMap.get(normalizedLabel) ??
          valueFieldLabelMap.get(String(labelValue ?? '')) ??
          labelValue;
      }
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
  }, [data.pivotColumnHierarchy, valueFieldLabelMap]);

  const rawColumnHeaderRows = columnHeaderInfo.rows;
  const columnLeafColumns = columnHeaderInfo.leafColumns;
  const columnHeaderRows = showColumnHeaders ? rawColumnHeaderRows : [];

  const getHeaderCellClass = (cell: ColumnHeaderCell) =>
    cn(
      'text-[12px] uppercase tracking-wide font-semibold',
      cell.isValueField ? 'text-right' : 'text-left',
    );

  const baseValueColumns = useMemo(
    () => columns.filter((column) => !rowFieldSet.has(column.toLowerCase())),
    [columns, rowFieldSet],
  );

  const valueColumns = useMemo(
    () =>
      columnLeafColumns.length > 0 ? columnLeafColumns : baseValueColumns,
    [columnLeafColumns, baseValueColumns],
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

  const pivotRowLookup = useMemo(() => {
    if (!rowFields.length || pivotRows.length === 0) {
      return new Map<string, Record<string, any>>();
    }

    const map = new Map<string, Record<string, any>>();

    pivotRows.forEach((row) => {
      const key = rowFields
        .map((field) => canonicalizeKey(row?.[field]))
        .join('|');
      if (!map.has(key)) {
        map.set(key, row);
      }
    });

    return map;
  }, [canonicalizeKey, pivotRows, rowFields]);

  const findMatchingPivotRow = useCallback(
    (labels: Array<{ field: string; value: any }>) => {
      if (!rowFields.length) {
        return pivotRows[0];
      }

      const key = rowFields
        .map((field) => {
          const label = labels.find((item) => item.field === field);
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
          const rowValKey = canonicalizeKey(row?.[field]);
          if (label && label.field === field) {
            const labelKey = canonicalizeKey(label.value);
            return rowValKey === labelKey;
          }
          return rowValKey === '' || rowValKey.endsWith('total');
        }),
      );
    },
    [canonicalizeKey, pivotRowLookup, pivotRows, rowFields],
  );

  const buildRecordForNode = useCallback(
    (node: HierNode) => {
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

      return record;
    },
    [canonicalizeKey, findMatchingPivotRow, normalizedValueColumns, rowFields, valueColumns],
  );

  const isRowGrandTotal = useCallback(
    (row: Record<string, any>) => {
      const isTotalString = (value: unknown) =>
        typeof value === 'string' && value.trim().toLowerCase().endsWith('total');
      if (rowFields.length > 0) {
        return rowFields.some((field) => isTotalString(row[field]));
      }
      const firstColumn = columns[0];
      if (!firstColumn) {
        return false;
      }
      return isTotalString(row[firstColumn]);
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

  const formatValue = (value: unknown) => {
    if (value === null || value === undefined) {
      return '-';
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value.toLocaleString() : '-';
    }
    if (value instanceof Date) {
      return value.toLocaleString();
    }
    return String(value);
  };

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

  const renderTabularTable = () => {
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
                    {field}
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
            : tabularRows.length === 0
            ? renderEmptyRow(
                colSpan,
                'No pivot results yet. Configure the layout and refresh to generate the table.'
              )
            : tabularRows.map((row, rowIndex) => (
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
                    const rawValue =
                      row.record[column] ??
                      (canonicalColumn && canonicalColumn !== column
                        ? row.record[canonicalColumn]
                        : undefined);

                    return (
                      <TableCell
                        key={`${rowIndex}-${column}`}
                        className="text-right tabular-nums font-medium"
                        style={getDataCellStyle({
                          row: row.record,
                          column,
                          rowIndex,
                          isRowHeader: false,
                        })}
                      >
                        {formatValue(rawValue)}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
        </TableBody>
      </Table>
    );
  };

  const renderCompactTable = () => {
    if (!rowFields.length || compactRows.length === 0) {
      return renderTabularTable();
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
                    Row Labels
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
            ? renderLoadingRow(Math.max(1 + valueColumns.length, 1))
            : compactRows.map((row, rowIndex) => {
                const cellStyle = getDataCellStyle({
                  row: row.record,
                  column: 'Row Labels',
                  rowIndex,
                  isRowHeader: true,
                });
                return (
                  <TableRow key={row.node.key} style={{ borderColor }}>
                    <TableCell
                      className="text-left font-semibold"
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
                    {valueColumns.map((column) => (
                      <TableCell
                        key={`${row.node.key}-${column}`}
                        className="text-right tabular-nums"
                        style={getDataCellStyle({
                          row: row.record,
                          column,
                          rowIndex,
                          isRowHeader: false,
                        })}
                      >
                        {formatValue(row.record[column])}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
        </TableBody>
      </Table>
    );
  };

  const renderOutlineTable = () => {
    if (!rowFields.length || outlineRows.length === 0) {
      return renderTabularTable();
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
                    {field}
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
            : outlineRows.map((row, rowIndex) => (
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
                  {valueColumns.map((column) => (
                    <TableCell
                      key={`${row.node.key}-${column}-${row.isTotal ? 'total' : 'value'}`}
                      className="text-right tabular-nums font-medium"
                      style={getDataCellStyle({
                        row: row.record,
                        column,
                        rowIndex,
                        isRowHeader: false,
                      })}
                    >
                      {formatValue(row.record[column])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
        </TableBody>
      </Table>
    );
  };

  const renderCurrentLayout = () => {
    if (!canUseHierarchicalLayouts) {
      return renderTabularTable();
    }
    switch (reportLayout) {
      case 'compact':
        return renderCompactTable();
      case 'outline':
        return renderOutlineTable();
      case 'tabular':
      default:
        return renderTabularTable();
    }
  };

  const datasetLabel = data.dataSource
    ? data.dataSource.split('/').filter(Boolean).slice(-1)[0]
    : 'Not selected';

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
  };

  const compactRows = useMemo<CompactRow[]>(() => {
    if (!rowFields.length || hierarchyTree.roots.length === 0) {
      return [];
    }

    const rows: CompactRow[] = [];

    const pushNode = (node: HierNode, ancestorCollapsed: boolean) => {
      const record = buildRecordForNode(node);
      const labelEntry = node.labels?.[node.labels.length - 1];
      const labelValue = labelEntry?.value ?? '';
      const nodeHasChildren = node.children.length > 0;
      const isCollapsed = collapsedSet.has(node.key) && nodeHasChildren;

      if (!ancestorCollapsed) {
        rows.push({
          node,
          depth: node.level,
          label: String(labelValue ?? ''),
          record,
          hasChildren: nodeHasChildren,
        });
      }

      const nextAncestorCollapsed = ancestorCollapsed || isCollapsed;
      node.children.forEach((child) => pushNode(child, nextAncestorCollapsed));
    };

    hierarchyTree.roots.forEach((root) => pushNode(root, false));

    return rows;
  }, [buildRecordForNode, collapsedSet, hierarchyTree, rowFields.length]);

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
      const record = buildRecordForNode(node);
      const display: Record<string, any> = {};
      rowFields.forEach((field, index) => {
        display[field] = index === node.level ? record[field] : '';
      });

      const shouldShowSubtotals = showSubtotals && nodeHasChildren;

      const createTotalRow = () => {
        const fieldName = rowFields[node.level] ?? rowFields[0];
        const totalRecord = { ...record };
        const totalDisplay = { ...display };
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
        rows.push({
          node,
          record,
          display,
          level: node.level,
          hasChildren: nodeHasChildren,
          isTotal: false,
        });

        if (shouldShowSubtotals && subtotalsMode === 'top' && !isCollapsed) {
          createTotalRow();
        }
      }

      const nextAncestorCollapsed = ancestorCollapsed || isCollapsed;
      node.children.forEach((child) => visit(child, nextAncestorCollapsed));

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
    return rows;
  }, [
    buildRecordForNode,
    collapsedSet,
    hierarchyTree,
    rowFields,
    subtotalsMode,
  ]);

  type TabularRow = {
    record: Record<string, any>;
  };

  const tabularRows = useMemo<TabularRow[]>(() => {
    if (!rowFields.length || hierarchyTree.roots.length === 0) {
      return pivotRows.map((row) => {
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

        return { record };
      });
    }

    const rows: TabularRow[] = [];

    const traverse = (node: HierNode, path: Record<string, any>) => {
      const nextPath = { ...path };
      node.labels?.forEach(({ field, value }) => {
        nextPath[field] = value;
        nextPath[canonicalizeKey(field)] = value;
      });

      const record = buildRecordForNode(node);
      rowFields.forEach((field, index) => {
        const canonicalField = canonicalizeKey(field);
        let displayValue = nextPath[field];
        if (displayValue === undefined) {
          displayValue = nextPath[canonicalField];
        }
        if (displayValue === undefined) {
          displayValue = '';
        }
        if (node.children.length > 0 && index === node.level && typeof displayValue === 'string') {
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
        rows.push({ record });
        return;
      }

      node.children.forEach((child) => traverse(child, nextPath));
      rows.push({ record });
    };

    hierarchyTree.roots.forEach((root) => traverse(root, {}));
    return rows;
  }, [buildRecordForNode, canonicalizeKey, hierarchyTree, pivotRows, rowFields, valueColumns]);

  const layoutOptions = useMemo(
    () => [
      { id: 'compact' as const, label: 'Show in Compact Form' },
      { id: 'outline' as const, label: 'Show in Outline Form' },
      { id: 'tabular' as const, label: 'Show in Tabular Form' },
    ],
    [],
  );

  const canUseHierarchicalLayouts = rowFields.length > 0 && hierarchyTree.roots.length > 0;

  React.useEffect(() => {
    if (!canUseHierarchicalLayouts && (reportLayout === 'compact' || reportLayout === 'outline')) {
      onReportLayoutChange('tabular');
    }
  }, [canUseHierarchicalLayouts, onReportLayoutChange, reportLayout]);

  return (
    <div className="w-full h-full bg-[#F3F3F3] overflow-auto">
      <div className="p-3 space-y-3">
        <Card className="bg-white border border-[#D9D9D9] rounded-md shadow-sm">
          <div className="px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-[#595959] tracking-wide uppercase">Layout</span>
                <div className="flex gap-1">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-7 px-3 text-[11px] font-medium text-[#3F3F3F] hover:bg-[#EBEBEB]">
                        <Grid3x3 className="w-3.5 h-3.5 mr-1.5" />
                        Subtotals
                        <ChevronDown className="w-3 h-3 ml-1" />
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
                      <Button variant="ghost" size="sm" className="h-7 px-3 text-[11px] font-medium text-[#3F3F3F] hover:bg-[#EBEBEB]">
                        <Grid3x3 className="w-3.5 h-3.5 mr-1.5" />
                        Grand Totals
                        <ChevronDown className="w-3 h-3 ml-1" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56 py-1">
                      {[
                        { id: 'off', label: 'Off for Rows and Columns' },
                        { id: 'both', label: 'On for Rows and Columns' },
                        { id: 'rows', label: 'On for Rows Only' },
                        { id: 'columns', label: 'On for Columns Only' },
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
                      <Button variant="ghost" size="sm" className="h-7 px-3 text-[11px] font-medium text-[#3F3F3F] hover:bg-[#EBEBEB]">
                        <Layout className="w-3.5 h-3.5 mr-1.5" />
                        Report Layout
                        <ChevronDown className="w-3 h-3 ml-1" />
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

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[#595959] tracking-wide uppercase">Options</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-3 text-[11px] font-medium text-[#3F3F3F] hover:bg-[#EBEBEB]"
                    >
                      <Info className="w-3.5 h-3.5 mr-1.5" />
                      PivotTable Options
                      <ChevronDown className="w-3 h-3 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56 py-1">
                    <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      PivotTable Options
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

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[#595959] tracking-wide uppercase">Style</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 px-3 text-[11px] font-medium text-[#3F3F3F] hover:bg-[#EBEBEB]">
                      <Palette className="w-3.5 h-3.5" />
                      PivotTable Styles
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
                            </div>
                              </div>

          <div className="flex flex-col gap-2 border-t border-border px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1 text-[11px] text-[#595959]">
              <p className="font-medium">
                Data source: <span className="text-[#262626]">{datasetLabel}</span>
              </p>
              {data.pivotUpdatedAt && (
                <p>Last updated: <span className="font-medium text-[#262626]">{new Date(data.pivotUpdatedAt).toLocaleString()}</span></p>
              )}
              {typeof data.pivotRowCount === 'number' && data.pivotRowCount > 0 && (
                <p>Rows returned: <span className="font-medium text-[#262626]">{data.pivotRowCount.toLocaleString()}</span></p>
              )}
                      </div>
            <div className="flex items-center gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={onSave}
                disabled={isSaving || !hasResults}
                className="h-8 px-3 text-[12px] font-semibold bg-[#1A73E8] hover:bg-[#1455ad] text-white"
              >
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onRefresh}
                disabled={isLoading || !data.dataSource}
                className="h-8 px-3 text-[12px] font-semibold border-[#D0D0D0] text-[#1A73E8] hover:bg-[#E8F0FE]"
              >
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                Refresh
              </Button>
                              </div>
                            </div>

          {(error || infoMessage || saveError || saveMessage) && (
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
              {!saveError && saveMessage && (
                <div className="flex items-start gap-2 bg-emerald-50 px-4 py-3 text-emerald-700">
                  <Info className="h-4 w-4 mt-0.5" />
                  <p className="text-sm">{saveMessage}</p>
              </div>
                            )}
            </div>
          )}
        </Card>

        {filters.length > 0 && (
          <div className="bg-card border border-border rounded-lg shadow-sm">
            <div className="bg-accent/5 border-b border-border px-4 py-2.5">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 bg-[#FFEED9] px-2 py-1 rounded border border-[#E0E0E0]">
                  <Filter className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-semibold text-[#C25700]">Filters</span>
                </div>
                {filters.map((field) => {
                  const options = getFilterOptions(field);
                  const selections = getFilterSelections(field);
                  const displayLabel = (() => {
                    if (!options.length) {
                      return field;
                    }
                    if (!selections.length || selections.length === options.length) {
                      return `${field} (All)`;
                    }
                    if (selections.length === 1) {
                      return `${field} (${selections[0]})`;
                    }
                    return `${field} (${selections.length} selected)`;
                  })();

                  const searchValue = filterSearch[field] ?? '';
                  const visibleOptions = options.filter((value) =>
                    value.toLowerCase().includes(searchValue.toLowerCase())
                  );

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
                    <DropdownMenu
                      key={field}
                      onOpenChange={(open) => {
                        if (open) {
                          ensureFilterOptions(field);
                        } else {
                          setFilterSearch((prev) => ({ ...prev, [field]: '' }));
                        }
                      }}
                    >
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          className="h-7 px-3 text-xs font-medium rounded-full bg-[#E6F4EA] text-[#0B8043] border border-[#C6E6C9] hover:bg-[#D7EADB]"
                        >
                          <span className="flex items-center gap-1.5">
                            {displayLabel}
                            <ChevronDown className="w-3 h-3" />
                          </span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-64 max-h-72 overflow-y-auto p-0">
                        <div className="px-3 py-2 space-y-2">
                          <Input
                            value={searchValue}
                            onChange={(event) =>
                              setFilterSearch((prev) => ({
                                ...prev,
                                [field]: event.target.value,
                              }))
                            }
                            placeholder="Search"
                            className="h-8 text-xs"
                          />
                          <div className="flex items-center gap-2 text-xs text-[#595959]">
                            <Checkbox
                              checked={selections.length === options.length && options.length > 0}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  handleSelectionChange(options);
                                } else {
                                  handleSelectionChange([]);
                                }
                              }}
                              className="h-3 w-3"
                              disabled={loadingFilter === field}
                            />
                            <span>Select Multiple Items</span>
              </div>
            </div>
                        <div className="border-t border-[#E6E6E6]" />
                        <div className="py-1">
                          {loadingFilter === field ? (
                            <DropdownMenuItem disabled className="text-xs text-[#595959]">
                              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Loading values…
                            </DropdownMenuItem>
                          ) : filterErrors[field] ? (
                            <DropdownMenuItem disabled className="text-xs text-destructive">
                              {filterErrors[field]}
                            </DropdownMenuItem>
                          ) : !options.length ? (
                            <DropdownMenuItem disabled className="text-xs text-[#9E9E9E]">
                              No values available
                            </DropdownMenuItem>
                          ) : visibleOptions.length ? (
                            visibleOptions.map((value) => {
                              const isChecked = selections.includes(value);
                              return (
                                <DropdownMenuItem
                                  key={value}
                                  className="flex items-center gap-2 text-xs"
                                  onSelect={(event) => {
                                    event.preventDefault();
                                    const nextSelections = isChecked
                                      ? selections.filter((item) => item !== value)
                                      : [...selections, value];
                                    handleSelectionChange(nextSelections);
                                  }}
                                >
                                  <Checkbox checked={isChecked} className="h-3 w-3" />
                                  <span className="truncate" title={value}>
                                    {value}
                                  </span>
                                </DropdownMenuItem>
                              );
                            })
                          ) : (
                            <DropdownMenuItem disabled className="text-xs text-[#9E9E9E]">
                              No matches
                            </DropdownMenuItem>
                          )}
                  </div>
                        <div className="border-t border-[#E6E6E6]" />
                        <div className="flex items-center justify-between px-3 py-2">
                          <Button
                            variant="ghost"
                            size="xs"
                            className="text-[11px]"
                            onClick={() => handleSelectionChange(options)}
                            disabled={!options.length}
                          >
                            Select All
                          </Button>
                          <Button
                            variant="ghost"
                            size="xs"
                            className="text-[11px]"
                            onClick={() => handleSelectionChange([])}
                            disabled={!options.length}
                          >
                            Clear
                          </Button>
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
                  );
                })}
            </div>
              </div>
            </div>
          )}

        <div className="bg-white border border-[#D9D9D9] rounded-md overflow-hidden shadow-sm">
          {renderCurrentLayout()}
        </div>
      </div>
    </div>
  );
};

export default PivotTableCanvas;

