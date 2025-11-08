import React, { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { X, GripVertical } from 'lucide-react';
import { PivotTableSettings as PivotTableSettingsType } from '@/components/LaboratoryMode/store/laboratoryStore';

const AGGREGATION_OPTIONS = ['sum', 'average', 'count', 'max', 'min'];

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
    const valueFields = data.valueFields.map(v =>
      v.field === field ? { ...v, aggregation } : v,
    );
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

                return (
                  <div
                    key={`${area}-${field}`}
                    className="flex items-center gap-2 rounded border border-border/60 bg-white px-2 py-1 text-xs shadow-sm"
                    draggable
                    onDragStart={event => handleDragStart(event, field, area, aggregation)}
                  >
                    <GripVertical className="h-3 w-3 text-muted-foreground" />
                    <span className="flex-1 text-foreground font-medium">{field}</span>
                    {isValues ? (
                      <select
                        className="h-6 rounded border border-border bg-background px-1 text-[11px] capitalize"
                        value={aggregation}
                        onChange={event => updateAggregation(field, event.target.value)}
                      >
                        {AGGREGATION_OPTIONS.map(option => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    <button
                      type="button"
                      className="ml-1 text-muted-foreground hover:text-foreground"
                      onClick={() => removeFieldFromArea(field, area)}
                    >
                      <X className="h-3 w-3" />
                    </button>
        </div>
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
        <div className="max-h-48 overflow-y-auto rounded-md border border-border/60 bg-background">
          {filteredFields.map(field => {
            const checked = unifiedSelectedFields.includes(field);
            return (
              <label
                key={field}
                className="flex items-center justify-between gap-3 border-b border-border/40 px-3 py-2 text-sm last:border-b-0"
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
                  <span className="text-foreground font-medium">{field}</span>
                </div>
              </label>
            );
          })}
          {filteredFields.length === 0 && (
            <div className="px-3 py-4 text-xs text-muted-foreground">No fields match your search.</div>
          )}
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <p className="text-sm font-semibold text-foreground">Drag fields between areas below</p>
        <div className="grid grid-cols-1 gap-4">
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

