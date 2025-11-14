import React, { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, GripVertical } from 'lucide-react';
import { PivotTableSettings as PivotTableSettingsType } from '@/components/LaboratoryMode/store/laboratoryStore';

const AGGREGATION_OPTIONS = ['sum', 'average', 'count', 'max', 'min', 'weighted_average'];

interface PivotTableSettingsProps {
  data: PivotTableSettingsType;
  onDataChange: (data: Partial<PivotTableSettingsType>) => void;
}

const PivotTableSettings: React.FC<PivotTableSettingsProps> = ({ data, onDataChange }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [dragOverArea, setDragOverArea] = useState<string | null>(null);

  const fieldOptions = useMemo(() => {
    if (data.dataSourceColumns && data.dataSourceColumns.length > 0) {
      return data.dataSourceColumns;
    }
    return data.fields;
  }, [data.dataSourceColumns, data.fields]);

  const filteredFields = useMemo(() => {
    if (!searchTerm.trim()) {
      return fieldOptions;
    }
    return fieldOptions.filter(field => field.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [fieldOptions, searchTerm]);

  const unifiedSelectedFields = useMemo(() => {
    const set = new Set<string>();
    data.rowFields.forEach(f => set.add(f));
    data.columnFields.forEach(f => set.add(f));
    data.filterFields.forEach(f => set.add(f));
    data.valueFields.forEach(vf => set.add(vf.field));
    return Array.from(set);
  }, [data.rowFields, data.columnFields, data.filterFields, data.valueFields]);

  const commitChange = (partial: Partial<PivotTableSettingsType>) => {
    const selectedFields = partial.selectedFields || unifiedSelectedFields;
    onDataChange({
      ...partial,
      selectedFields,
    });
  };

  const filterOptionsMap = data.pivotFilterOptions ?? {};
  const filterSelectionsMap = data.pivotFilterSelections ?? {};

  const synchronizeFilterSelections = (fields: string[], baseSelections: Record<string, string[]>) => {
    const nextSelections: Record<string, string[]> = { ...baseSelections };
    const normalize = (field: string) => field.toLowerCase();

    fields.forEach((field) => {
      const key = normalize(field);
      const existing = nextSelections[field] ?? nextSelections[key];
      if (!existing || existing.length === 0) {
        const options = filterOptionsMap[field] ?? filterOptionsMap[key] ?? [];
        nextSelections[field] = options;
        nextSelections[key] = options;
      }
    });

    Object.keys(nextSelections).forEach((key) => {
      const canonical = fields.find(
        (field) => key === field || key === field.toLowerCase()
      );
      if (!canonical) {
        delete nextSelections[key];
      }
    });

    return nextSelections;
  };

  const ensureSelectedFields = (nextState: {
    rowFields: string[];
    columnFields: string[];
    filterFields: string[];
    valueFields: { field: string; aggregation: string }[];
  }) => {
    const combined = new Set<string>();
    nextState.rowFields.forEach(f => combined.add(f));
    nextState.columnFields.forEach(f => combined.add(f));
    nextState.filterFields.forEach(f => combined.add(f));
    nextState.valueFields.forEach(v => combined.add(v.field));
    return Array.from(combined);
  };

  const handleCheckboxToggle = (field: string, checked: boolean) => {
    if (checked) {
      if (data.rowFields.includes(field) || data.columnFields.includes(field) || data.filterFields.includes(field) || data.valueFields.some(v => v.field === field)) {
        return;
      }
      const updatedRowFields = [...data.rowFields, field];
      onDataChange({
        rowFields: updatedRowFields,
        selectedFields: ensureSelectedFields({
          rowFields: updatedRowFields,
          columnFields: data.columnFields,
          filterFields: data.filterFields,
          valueFields: data.valueFields,
        }),
      });
    } else {
      const updatedRowFields = data.rowFields.filter(f => f !== field);
      const updatedColumnFields = data.columnFields.filter(f => f !== field);
      const updatedFilterFields = data.filterFields.filter(f => f !== field);
      const updatedValueFields = data.valueFields.filter(v => v.field !== field);
      onDataChange({
        rowFields: updatedRowFields,
        columnFields: updatedColumnFields,
        filterFields: updatedFilterFields,
        valueFields: updatedValueFields,
        selectedFields: ensureSelectedFields({
          rowFields: updatedRowFields,
          columnFields: updatedColumnFields,
          filterFields: updatedFilterFields,
          valueFields: updatedValueFields,
        }),
      });
    }
  };

  const handleDragStart = (event: React.DragEvent, field: string, source: string, aggregation?: string) => {
    event.dataTransfer.setData(
      'application/json',
      JSON.stringify({ field, source, aggregation }),
    );
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = (event: React.DragEvent, target: 'rows' | 'columns' | 'filters' | 'values') => {
    event.preventDefault();
    setDragOverArea(null);
    const transfer = event.dataTransfer.getData('application/json');
    if (!transfer) return;
    try {
      const payload = JSON.parse(transfer) as { field: string; source: string; aggregation?: string };
      const field = payload.field;
      if (!field) return;

      const rowFields = data.rowFields.filter(f => f !== field);
      const columnFields = data.columnFields.filter(f => f !== field);
      const filterFields = data.filterFields.filter(f => f !== field);
      let valueFields = data.valueFields.filter(v => v.field !== field);

      switch (target) {
        case 'rows':
          rowFields.push(field);
          break;
        case 'columns':
          columnFields.push(field);
          break;
        case 'filters':
          filterFields.push(field);
          break;
        case 'values':
          valueFields = [
            ...valueFields,
            { field, aggregation: payload.aggregation || 'sum' },
          ];
          break;
        default:
          break;
      }

      const synchronizedSelections = synchronizeFilterSelections(filterFields, filterSelectionsMap);

      commitChange({
        rowFields,
        columnFields,
        filterFields,
        valueFields,
        pivotFilterSelections: synchronizedSelections,
        selectedFields: ensureSelectedFields({ rowFields, columnFields, filterFields, valueFields }),
      });
    } catch (error) {
      console.warn('PivotTable drag payload parse error', error);
    }
  };

  const handleDragOver = (event: React.DragEvent, area: string) => {
    event.preventDefault();
    setDragOverArea(area);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOverArea(null);
  };

  const removeFieldFromArea = (field: string, area: 'rows' | 'columns' | 'filters' | 'values') => {
    const rowFields = data.rowFields.filter(f => f !== field);
    const columnFields = data.columnFields.filter(f => f !== field);
    const filterFields = data.filterFields.filter(f => f !== field);
    let valueFields = data.valueFields.filter(v => v.field !== field);

    if (area === 'values') {
      valueFields = data.valueFields.filter(v => v.field !== field);
    }

    const synchronizedSelections = synchronizeFilterSelections(filterFields, filterSelectionsMap);

    commitChange({
      rowFields,
      columnFields,
      filterFields,
      valueFields,
      pivotFilterSelections: synchronizedSelections,
      selectedFields: ensureSelectedFields({ rowFields, columnFields, filterFields, valueFields }),
    });
  };

  const updateAggregation = (field: string, aggregation: string) => {
    const valueFields = data.valueFields.map((v) => {
      if (v.field !== field) {
        return v;
      }
      if (aggregation === 'weighted_average') {
        return { ...v, aggregation };
      }
      const { weightColumn, ...rest } = v as typeof v & { weightColumn?: string };
      return { ...rest, aggregation };
    });
    onDataChange({ valueFields });
  };

  const updateWeightColumn = (field: string, weightColumn: string) => {
    const valueFields = data.valueFields.map((v) => {
      if (v.field !== field) {
        return v;
      }
      return {
        ...v,
        aggregation: v.aggregation === 'weighted_average' ? v.aggregation : 'weighted_average',
        weightColumn,
      };
    });
    onDataChange({ valueFields });
  };

  const renderZone = (
    label: string,
    area: 'rows' | 'columns' | 'filters' | 'values',
    items: string[] | { field: string; aggregation: string }[],
  ) => {
    const isValues = area === 'values';
    const isDragOver = dragOverArea === area;

  return (
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground flex items-center gap-2 uppercase tracking-wide">
          {label}
        </p>
        <div
          className={cn(
            'min-h-[72px] rounded-md border border-dashed border-border bg-background/40 p-2 transition-colors',
            isDragOver ? 'border-primary bg-primary/5' : 'hover:border-primary/50'
          )}
          onDragOver={event => handleDragOver(event, area)}
          onDragLeave={handleDragLeave}
          onDrop={event => handleDrop(event, area)}
        >
          {(!items || (Array.isArray(items) && items.length === 0)) && (
            <span className="text-[11px] text-muted-foreground">Drop fields here</span>
          )}
          {Array.isArray(items) && items.length > 0 && (
            <div className="space-y-2">
              {items.map(item => {
                const field = isValues ? (item as { field: string }).field : (item as string);
                const aggregation = isValues ? (item as { field: string; aggregation: string }).aggregation : undefined;
                const weightColumn = isValues ? (item as { field: string; aggregation: string; weightColumn?: string }).weightColumn : undefined;

                return (
                  <DropdownMenu key={`${area}-${field}`}>
                    <DropdownMenuTrigger asChild>
                      <div
                        role="button"
                        tabIndex={0}
                        className="flex items-center gap-2 rounded border border-border/60 bg-white px-2 py-1 text-xs shadow-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary"
                        draggable
                        onDragStart={event => handleDragStart(event, field, area, aggregation)}
                      >
                        <GripVertical className="h-3 w-3 text-muted-foreground" />
                        <span className="flex-1 text-foreground font-medium">{field}</span>
                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                      </div>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      {isValues ? (
                        <>
                          <DropdownMenuLabel className="text-[11px] uppercase tracking-wide">
                            Value Settings
                          </DropdownMenuLabel>
                          {AGGREGATION_OPTIONS.map((option) => {
                            const isActive = option === aggregation;
                            const label =
                              option === 'sum'
                                ? 'Sum'
                                : option === 'average'
                                ? 'Average'
                                : option === 'count'
                                ? 'Count'
                                : option === 'min'
                                ? 'Min'
                                : option === 'max'
                                ? 'Max'
                                : 'Weighted Average';
                            

                            if (option === 'weighted_average') {
                              return (
                                <DropdownMenuSub
                                  key={option}
                                  onOpenChange={(open) => {
                                    if (open) {
                                      updateAggregation(field, option);
                                    }
                                  }}
                                >
                                  <DropdownMenuSubTrigger
                                    onClick={(event) => {
                                      event.preventDefault();
                                      updateAggregation(field, option);
                                    }}
                                    className={cn(
                                      'text-xs',
                                      isActive ? 'font-semibold text-primary' : '',
                                    )}
                                  >
                                    {label}
                                  </DropdownMenuSubTrigger>
                                  <DropdownMenuSubContent side="right" align="start" className="w-40">
                                    <DropdownMenuLabel className="text-[10px] uppercase tracking-wide">
                                      Weight Column
                                    </DropdownMenuLabel>
                                    {fieldOptions.map((col) => (
                                      <DropdownMenuItem
                                        key={col}
                                        onSelect={(event) => {
                                          event.preventDefault();
                                          updateWeightColumn(field, col);
                                        }}
                                        className={cn(
                                          'text-xs',
                                          weightColumn === col ? 'font-semibold text-primary' : '',
                                        )}
                                      >
                                        {col}
                                      </DropdownMenuItem>
                                    ))}
                                  </DropdownMenuSubContent>
                                </DropdownMenuSub>
                              );
                            }

                            return (
                              <DropdownMenuItem
                                key={option}
                                onSelect={(event) => {
                                  event.preventDefault();
                                  updateAggregation(field, option);
                                }}
                                className={cn(
                                  'text-xs capitalize',
                                  isActive ? 'font-semibold text-primary' : '',
                                )}
                              >
                                {label}
                              </DropdownMenuItem>
                            );
                          })}
                          <DropdownMenuSeparator />
                        </>
                      ) : null}
                      <DropdownMenuItem
                        onSelect={(event) => {
                          event.preventDefault();
                          removeFieldFromArea(field, area);
                        }}
                        className="text-xs"
                      >
                        Remove Field
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                );
              })}
      </div>
          )}
      </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-foreground">PivotTable Fields</h4>
          <p className="text-xs text-muted-foreground">Drag fields into the layout areas below.</p>
        </div>
        <Input
          placeholder="Search fields"
          value={searchTerm}
          onChange={event => setSearchTerm(event.target.value)}
          className="h-8 text-sm"
        />
        <div className="max-h-48 overflow-y-auto rounded-md border border-border/60 bg-background px-2 py-1">
          <div className="grid grid-cols-2 gap-1">
            {filteredFields.map(field => {
            const checked = unifiedSelectedFields.includes(field);
            return (
              <label
                key={field}
                className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted/40 transition-colors"
                draggable
                onDragStart={event => handleDragStart(event, field, 'fields')}
              >
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(checkedValue) =>
                      handleCheckboxToggle(field, Boolean(checkedValue))
                    }
                    className="h-4 w-4"
                  />
                  <span className="text-foreground font-medium truncate" title={field}>
                    {field.length > 4 ? `${field.slice(0, 4)}...` : field}
                  </span>
                </div>
              </label>
            );
          })}
          </div>
          {filteredFields.length === 0 && (
            <div className="px-3 py-4 text-xs text-muted-foreground">No fields match your search.</div>
          )}
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <p className="text-sm font-semibold text-foreground">Drag fields between areas below</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {renderZone('Filters', 'filters', data.filterFields)}
          {renderZone('Columns', 'columns', data.columnFields)}
          {renderZone('Rows', 'rows', data.rowFields)}
          {renderZone('Values', 'values', data.valueFields)}
        </div>
      </Card>
    </div>
  );
};

export default PivotTableSettings;

