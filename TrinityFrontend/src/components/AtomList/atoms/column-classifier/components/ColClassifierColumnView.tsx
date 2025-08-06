import React, { useEffect, useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <div className="w-1 h-8 bg-gradient-to-b from-primary to-primary/80 rounded-full mr-4" />
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
                <div className="w-40 px-4 py-4 font-bold text-black bg-gray-100 border-r border-gray-300">
                  Columns
                </div>
                {displayed.map((col, index) => (
                  <div
                    key={index}
                    className="w-32 px-4 py-4 text-sm font-semibold text-black border-r border-gray-200 text-center"
                  >
                    {col.column}
                  </div>
                ))}
              </div>

              <div className="flex bg-white border-b border-gray-200">
                <div className="w-40 px-4 py-4 font-bold text-black bg-gray-100 border-r border-gray-300">
                  Data Type
                </div>
                {displayed.map((col, index) => (
                  <div
                    key={index}
                    className="w-32 px-4 py-4 text-sm border-r border-gray-200 text-center"
                  >
                    <Badge
                      variant="outline"
                      className="text-xs font-medium bg-gray-50 text-black border-gray-300"
                    >
                      {col.data_type}
                    </Badge>
                  </div>
                ))}
              </div>

              <div className="flex bg-gray-50 border-b border-gray-200">
                <div className="w-40 px-4 py-4 font-bold text-black bg-gray-100 border-r border-gray-300">
                  Unique Counts
                </div>
                {displayed.map((col, index) => (
                  <div
                    key={index}
                    className="w-32 px-4 py-4 text-sm text-black border-r border-gray-200 text-center font-medium"
                  >
                    {col.unique_count}
                  </div>
                ))}
              </div>

              <div className="flex bg-white">
                <div className="w-40 px-4 py-4 font-bold text-black bg-gray-100 border-r border-gray-300">
                  Unique Values
                </div>
                {displayed.map((col, index) => (
                  <div
                    key={index}
                    className="w-32 px-4 py-4 text-sm border-r border-gray-200 text-center"
                  >
                    <div className="flex flex-col gap-1 items-center">
                      {col.unique_values.slice(0, 2).map((val, i) => (
                        <Badge
                          key={i}
                          variant="outline"
                          className="text-xs bg-gray-50 text-black border-gray-300"
                        >
                          {String(val)}
                        </Badge>
                      ))}
                      {col.unique_values.length > 2 && (
                        <span className="text-xs text-gray-600 font-medium">
                          +{col.unique_values.length - 2}
                        </span>
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
