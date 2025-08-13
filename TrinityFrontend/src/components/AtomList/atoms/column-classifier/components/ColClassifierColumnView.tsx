import React, { useEffect, useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
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

  const allColumns = useMemo(
    () =>
      columns.unclassified
        .concat(columns.identifiers, columns.measures)
        .map(name => summary.find(s => s.column === name)!)
        .filter(Boolean),
    [columns, summary]
  );

  const displayed = useMemo(
    () => {
      const filtered = filterUnique
        ? allColumns.filter(c => c.unique_count > 1)
        : allColumns;
      return filtered.slice(0, 20);
    },
    [allColumns, filterUnique]
  );

  if (!displayed.length) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center">
          <div className="w-1 h-6 bg-gradient-to-b from-primary to-primary/80 rounded-full mr-4" />
          <h3 className="text-xl font-bold text-foreground">Column Overview</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Fetch columns with more than one unique value</span>
          <Switch
            checked={filterUnique}
            onCheckedChange={onFilterToggle}
            className="data-[state=checked]:bg-[#458EE2]"
          />
        </div>
      </div>

      <Card className="border-2 border-black shadow-lg bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-max">
            <div className="grid grid-rows-4 gap-0">
              <div className="flex bg-white border-b border-gray-200">
                <div className="w-40 font-bold text-black bg-gray-100 border-r border-gray-300 flex items-center justify-center sticky left-0 z-10">
                  Columns
                </div>
                {displayed.map((col, index) => (
                  <div
                    key={index}
                    className="w-32 text-sm font-semibold text-black border-r border-gray-200 flex items-center justify-center"
                  >
                    {col.column}
                  </div>
                ))}
              </div>

              <div className="flex bg-white border-b border-gray-200">
                <div className="w-40 font-bold text-black bg-gray-100 border-r border-gray-300 flex items-center justify-center sticky left-0 z-10">
                  Data Type
                </div>
                {displayed.map((col, index) => (
                  <div
                    key={index}
                    className="w-32 text-sm border-r border-gray-200 flex items-center justify-center"
                  >
                    <Badge
                      className="p-0 text-xs font-medium bg-gray-50 text-black"
                    >
                      {col.data_type}
                    </Badge>
                  </div>
                ))}
              </div>

              <div className="flex bg-gray-50 border-b border-gray-200">
                <div className="w-40 font-bold text-black bg-gray-100 border-r border-gray-300 flex items-center justify-center sticky left-0 z-10">
                  Unique Counts
                </div>
                {displayed.map((col, index) => (
                  <div
                    key={index}
                    className="w-32 text-sm text-black border-r border-gray-200 flex items-center justify-center font-medium"
                  >
                    {col.unique_count}
                  </div>
                ))}
              </div>

              <div className="flex bg-white">
                <div className="w-40 font-bold text-black bg-gray-100 border-r border-gray-300 flex items-center justify-center sticky left-0 z-10 py-1">
                  Unique Values
                </div>
                {displayed.map((col, index) => (
                  <div
                    key={index}
                    className="w-32 text-sm border-r border-gray-200 flex items-center justify-center py-1"
                  >
                    <div className="flex flex-col gap-px items-center">
                      {col.unique_values.slice(0, 2).map((val, i) => (
                        <Badge
                          key={i}
                          className="p-0 text-xs bg-gray-50 text-black"
                        >
                          {String(val)}
                        </Badge>
                      ))}
                      {col.unique_values.length > 2 && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="flex items-center gap-0.5 text-xs text-gray-600 font-medium cursor-pointer">
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
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default ColClassifierColumnView;
