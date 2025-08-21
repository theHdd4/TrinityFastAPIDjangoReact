import React, { useEffect, useState, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Plus } from 'lucide-react';
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

const categoryColors: Record<ColumnInfoWithCategory['category'], string> = {
  unclassified: '#d5def7',
  identifiers: '#2153f3',
  measures: '#0d1a4e',
};

function Dot({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-2.5 w-2.5 rounded-full translate-y-0.5"
      style={{ backgroundColor: color }}
      aria-hidden
    />
  );
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
    const filtered = filterUnique
      ? allColumns.filter(c => c.unique_count > 1)
      : allColumns;
    return filtered.slice(0, 20);
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

        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-white to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-white to-transparent" />

          <div className="overflow-x-auto">
            <table className="min-w-[700px] w-full border-collapse text-sm border border-black">
              <colgroup>
                <col className="w-[30%]" />
                <col className="w-[20%]" />
                <col className="w-[15%]" />
                <col className="w-[35%]" />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-slate-50 text-slate-600">
                <tr className="border-b border-slate-200">
                  <th className="px-5 py-3 text-left font-medium">Column</th>
                  <th className="px-5 py-3 text-left font-medium">Data type</th>
                  <th className="px-5 py-3 text-left font-medium">Unique count</th>
                  <th className="px-5 py-3 text-left font-medium">Sample values</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map(col => (
                  <tr
                    key={col.column}
                    className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors"
                  >
                    <td className="px-5 py-3 whitespace-nowrap text-slate-800">
                      <div className="flex items-center gap-3">
                        <Dot color={categoryColors[col.category]} />
                        <span>{col.column}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-700">{col.data_type}</td>
                    <td className="px-5 py-3 text-slate-700">
                      {col.unique_count.toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-slate-700">
                      <div className="flex flex-wrap items-center gap-1">
                        {col.unique_values.slice(0, 2).map((val, i) => (
                          <Badge
                            key={i}
                            className="p-0 px-1 text-xs bg-gray-50 text-slate-700"
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
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ColClassifierColumnView;

