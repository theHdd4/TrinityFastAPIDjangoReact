import React, { useCallback, useMemo, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  Save,
  RefreshCcw,
} from 'lucide-react';
import { PivotTableSettings } from '@/components/LaboratoryMode/store/laboratoryStore';
import { SCOPE_SELECTOR_API } from '@/lib/api';

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
}) => {
  const [styleOptions, setStyleOptions] = useState({
    rowHeaders: true,
    columnHeaders: true,
    bandedRows: false,
    bandedColumns: false,
  });

  const [selectedStyle, setSelectedStyle] = useState('default');
  const [filterSearch, setFilterSearch] = useState<Record<string, string>>({});
  const [loadingFilter, setLoadingFilter] = useState<string | null>(null);
  const [filterErrors, setFilterErrors] = useState<Record<string, string | null>>({});

  const pivotStyles = {
    light: [
      { id: 'light-1', name: 'Light Style 1', headerBg: 'bg-green-100', rowBg: 'bg-green-50', border: 'border-green-200' },
      { id: 'light-2', name: 'Light Style 2', headerBg: 'bg-gray-100', rowBg: 'bg-gray-50', border: 'border-gray-200' },
      { id: 'light-3', name: 'Light Style 3', headerBg: 'bg-blue-100', rowBg: 'bg-blue-50', border: 'border-blue-200' },
      { id: 'light-4', name: 'Light Style 4', headerBg: 'bg-orange-100', rowBg: 'bg-orange-50', border: 'border-orange-200' },
      { id: 'light-5', name: 'Light Style 5', headerBg: 'bg-teal-100', rowBg: 'bg-teal-50', border: 'border-teal-200' },
      { id: 'light-6', name: 'Light Style 6', headerBg: 'bg-cyan-100', rowBg: 'bg-cyan-50', border: 'border-cyan-200' },
      { id: 'light-7', name: 'Light Style 7', headerBg: 'bg-purple-100', rowBg: 'bg-purple-50', border: 'border-purple-200' },
    ],
    medium: [
      { id: 'medium-1', name: 'Medium Style 1', headerBg: 'bg-gray-600 text-white', rowBg: 'bg-gray-100', border: 'border-gray-300' },
      { id: 'medium-2', name: 'Medium Style 2', headerBg: 'bg-blue-600 text-white', rowBg: 'bg-blue-50', border: 'border-blue-300' },
      { id: 'medium-3', name: 'Medium Style 3', headerBg: 'bg-orange-600 text-white', rowBg: 'bg-orange-50', border: 'border-orange-300' },
      { id: 'medium-4', name: 'Medium Style 4', headerBg: 'bg-green-600 text-white', rowBg: 'bg-green-50', border: 'border-green-300' },
      { id: 'medium-5', name: 'Medium Style 5', headerBg: 'bg-cyan-600 text-white', rowBg: 'bg-cyan-50', border: 'border-cyan-300' },
      { id: 'medium-6', name: 'Medium Style 6', headerBg: 'bg-purple-600 text-white', rowBg: 'bg-purple-50', border: 'border-purple-300' },
      { id: 'medium-7', name: 'Medium Style 7', headerBg: 'bg-lime-600 text-white', rowBg: 'bg-lime-50', border: 'border-lime-300' },
    ],
    dark: [
      { id: 'dark-1', name: 'Dark Style 1', headerBg: 'bg-gray-800 text-white', rowBg: 'bg-gray-700 text-white', border: 'border-gray-600' },
      { id: 'dark-2', name: 'Dark Style 2', headerBg: 'bg-blue-800 text-white', rowBg: 'bg-blue-700 text-white', border: 'border-blue-600' },
      { id: 'dark-3', name: 'Dark Style 3', headerBg: 'bg-orange-800 text-white', rowBg: 'bg-orange-700 text-white', border: 'border-orange-600' },
      { id: 'dark-4', name: 'Dark Style 4', headerBg: 'bg-green-800 text-white', rowBg: 'bg-green-700 text-white', border: 'border-green-600' },
      { id: 'dark-5', name: 'Dark Style 5', headerBg: 'bg-cyan-800 text-white', rowBg: 'bg-cyan-700 text-white', border: 'border-cyan-600' },
      { id: 'dark-6', name: 'Dark Style 6', headerBg: 'bg-purple-800 text-white', rowBg: 'bg-purple-700 text-white', border: 'border-purple-600' },
      { id: 'dark-7', name: 'Dark Style 7', headerBg: 'bg-lime-800 text-white', rowBg: 'bg-lime-700 text-white', border: 'border-lime-600' },
    ],
  };

  const filters = data.filterFields ?? [];
  const pivotRows = data.pivotResults ?? [];
  const hasResults = pivotRows.length > 0;
  const showRowHeaders = styleOptions.rowHeaders;
  const showColumnHeaders = styleOptions.columnHeaders;
  const grandTotalsMode = data.grandTotalsMode ?? 'both';

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

  const datasetLabel = data.dataSource
    ? data.dataSource.split('/').filter(Boolean).slice(-1)[0]
    : 'Not selected';

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
                    <DropdownMenuContent align="start" className="w-56">
                      <DropdownMenuItem>Do Not Show Subtotals</DropdownMenuItem>
                      <DropdownMenuItem>Show All Subtotals at Bottom of Group</DropdownMenuItem>
                      <DropdownMenuItem>Show All Subtotals at Top of Group</DropdownMenuItem>
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
                    <DropdownMenuContent align="start" className="w-56">
                      <DropdownMenuItem>Show in Compact Form</DropdownMenuItem>
                      <DropdownMenuItem>Show in Outline Form</DropdownMenuItem>
                      <DropdownMenuItem>Show in Tabular Form</DropdownMenuItem>
                      <DropdownMenuItem className="border-t">Repeat All Item Labels</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-[#595959] tracking-wide uppercase">Options</span>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <Checkbox
                      checked={styleOptions.rowHeaders}
                      onCheckedChange={(checked) =>
                        setStyleOptions((prev) => ({ ...prev, rowHeaders: checked as boolean }))
                      }
                      className="h-3.5 w-3.5"
                    />
                    <span className="text-xs text-muted-foreground">Row Headers</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <Checkbox
                      checked={styleOptions.columnHeaders}
                      onCheckedChange={(checked) =>
                        setStyleOptions((prev) => ({ ...prev, columnHeaders: checked as boolean }))
                      }
                      className="h-3.5 w-3.5"
                    />
                    <span className="text-xs text-muted-foreground">Column Headers</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <Checkbox
                      checked={styleOptions.bandedRows}
                      onCheckedChange={(checked) =>
                        setStyleOptions((prev) => ({ ...prev, bandedRows: checked as boolean }))
                      }
                      className="h-3.5 w-3.5"
                    />
                    <span className="text-xs text-muted-foreground">Banded Rows</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[#595959] tracking-wide uppercase">Style</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 px-3 text-[11px] font-medium text-[#3F3F3F] gap-1 hover:bg-[#EBEBEB]">
                      <Palette className="w-3.5 h-3.5" />
                      PivotTable Styles
                      <ChevronDown className="w-3 h-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-[500px] p-4 max-h-[600px] overflow-y-auto">
                    {(['light', 'medium', 'dark'] as const).map((group) => (
                      <div key={group} className="mb-6 last:mb-0">
                        <h4 className="text-sm font-semibold mb-3 text-foreground capitalize">{group}</h4>
                      <div className="grid grid-cols-4 gap-3">
                          {pivotStyles[group].map((style) => (
                          <button
                            key={style.id}
                            onClick={() => setSelectedStyle(style.id)}
                              className={cn(
                                'relative group rounded-lg border-2 transition-all overflow-hidden',
                                selectedStyle === style.id
                                ? 'border-primary ring-2 ring-primary/20 shadow-lg'
                                : 'border-border hover:border-primary/50 hover:shadow-md'
                              )}
                          >
                            <div className="p-2">
                              <div className="space-y-0.5">
                                  <div className={cn('h-3 rounded-t border', style.headerBg, style.border)} />
                                  <div className={cn('h-2 border-x border-b', style.rowBg, style.border)} />
                                  <div className={cn('h-2 border-x border-b', style.rowBg, style.border)} />
                                  <div className={cn('h-2 border-x border-b', style.rowBg, style.border)} />
                              </div>
                            </div>
                            {selectedStyle === style.id && (
                              <div className="absolute top-1 right-1 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                                <div className="w-2 h-2 bg-white rounded-full" />
                              </div>
                            )}
                          </button>
                        ))}
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
          <Table>
            <TableHeader>
              <TableRow className="bg-[#F6F6F6] border-b border-[#E0E0E0]">
                {columns.map((column, index) => {
                  const isRowHeader =
                    (showRowHeaders && data.rowFields.some(
                      (row) => row.toLowerCase() === column.toLowerCase()
                    )) || index === 0;
                  return (
                    <TableHead
                      key={column}
                      className={cn(
                        'font-semibold text-[#3F3F3F] border-[#E0E0E0] text-[12px] uppercase tracking-wide',
                        !showColumnHeaders && 'text-[#BFBFBF]',
                        isRowHeader ? 'text-left border-r' : 'text-right border-r last:border-r-0'
                      )}
                    >
                      <div className={cn('flex items-center gap-1', isRowHeader ? 'justify-start' : 'justify-end')}>
                        {column}
                        {isRowHeader && <ChevronDown className="w-3 h-3" />}
                  </div>
                </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="text-center py-8">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" />
                  </TableCell>
                </TableRow>
              ) : hasResults ? (
                pivotRows.map((row, rowIndex) => (
                  <TableRow
                    key={rowIndex}
                    className={cn(
                      'transition-colors text-[13px]',
                      styleOptions.bandedRows && rowIndex % 2 === 1
                        ? 'bg-[#FDF8F2]'
                        : 'bg-white hover:bg-[#F5F5F5]'
                    )}
                  >
                    {columns.map((column, index) => {
                      const value = row[column];
                      const isRowHeader =
                        (showRowHeaders && data.rowFields.some(
                          (field) => field.toLowerCase() === column.toLowerCase()
                        )) || index === 0;
                      return (
                        <TableCell
                          key={`${rowIndex}-${column}`}
                          className={cn(
                            'border-[#E0E0E0] text-[#262626] align-middle',
                            isRowHeader
                              ? 'text-left border-r font-semibold'
                              : 'text-right border-r tabular-nums font-medium text-[#1F3B57]',
                            styleOptions.bandedColumns && index % 2 === 1 && 'bg-[#FDF1E8]'
                          )}
                        >
                          {formatValue(value)}
                </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="text-center py-8 text-sm text-muted-foreground">
                    No pivot results yet. Configure the layout and refresh to generate the table.
                </TableCell>
              </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
};

export default PivotTableCanvas;

