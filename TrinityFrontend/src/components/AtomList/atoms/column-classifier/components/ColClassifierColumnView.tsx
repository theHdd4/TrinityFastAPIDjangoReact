import React, { useEffect, useState, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Plus } from 'lucide-react';
import Table from '@/templates/tables/table';
import { FEATURE_OVERVIEW_API } from '@/lib/api';

interface ColumnInfo {
  column: string;
  data_type: string;
  unique_count: number;
  unique_values: string[];
}

interface ColumnInfoWithCategory extends ColumnInfo {
  category: 'unclassified' | 'identifiers' | 'measures';
}

interface ColClassifierColumnViewProps {
  objectName: string;
  columns: {
    unclassified: string[];
    identifiers: string[];
    measures: string[];
  };
  filterUnique: boolean;
  onFilterToggle: (val: boolean) => void;
}

const ColClassifierColumnView: React.FC<ColClassifierColumnViewProps> = ({
  objectName,
  columns,
  filterUnique,
  onFilterToggle,
}) => {
  const [summary, setSummary] = useState<ColumnInfo[]>([]);

  useEffect(() => {
    if (!objectName) return;
    const fetchSummary = async () => {
      try {
        const res = await fetch(
          `${FEATURE_OVERVIEW_API}/column_summary?object_name=${encodeURIComponent(objectName)}`
        );
        if (!res.ok) {
          setSummary([]);
          return;
        }
        const data = await res.json();
        setSummary(Array.isArray(data.summary) ? data.summary.filter(Boolean) : []);
      } catch {
        setSummary([]);
      }
    };
    fetchSummary();
  }, [objectName]);

  const allColumns = useMemo(() => {
    const mapWithCategory = (
      names: string[],
      category: ColumnInfoWithCategory['category']
    ) =>
      names
        .map(name => {
          const info = summary.find(s => s.column === name);
          return info ? { ...info, category } : null;
        })
        .filter(Boolean) as ColumnInfoWithCategory[];

    return [
      ...mapWithCategory(columns.unclassified, 'unclassified'),
      ...mapWithCategory(columns.identifiers, 'identifiers'),
      ...mapWithCategory(columns.measures, 'measures'),
    ];
  }, [columns, summary]);

  const displayed = useMemo(() => {
    return filterUnique
      ? allColumns.filter(c => c.unique_count > 1)
      : allColumns;
  }, [allColumns, filterUnique]);

  if (!displayed.length) return null;

  return (
    <div className="w-full">
      <div className="mx-auto max-w-screen-2xl rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-800">Cardinality View</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Select Columns with more than one unique values</span>
            <Switch
              checked={filterUnique}
              onCheckedChange={onFilterToggle}
              className="data-[state=checked]:bg-[#458EE2]"
            />
          </div>
        </div>

        <Table
          headers={["Column", "Data type", "Unique count", "Sample values"]}
          colClasses={["w-[30%]", "w-[20%]", "w-[15%]", "w-[35%]"]}
          bodyClassName="max-h-[484px] overflow-y-auto"
        >
          {displayed.map(col => (
            <tr key={col.column} className="table-row">
              <td className="table-cell-primary">{col.column}</td>
              <td className="table-cell">{col.data_type}</td>
              <td className="table-cell">{col.unique_count.toLocaleString()}</td>
              <td className="table-cell">
                <div className="flex flex-wrap items-center gap-1">
                  {col.unique_values.slice(0, 2).map((val, i) => (
                    <Badge
                      key={i}
                      className="p-0 px-1 text-xs bg-gray-50 text-slate-700 hover:bg-gray-50"
                    >
                      {String(val)}
                    </Badge>
                  ))}
                  {col.unique_values.length > 2 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-center gap-0.5 text-xs text-slate-600 font-medium cursor-pointer">
                          <Plus className="w-3 h-3" />
                          {col.unique_values.length - 2}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs max-w-xs whitespace-pre-wrap">
                        {col.unique_values
                          .slice(2)
                          .map(val => String(val))
                          .join(', ')}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </Table>
      </div>
    </div>
  );
};

export default ColClassifierColumnView;

