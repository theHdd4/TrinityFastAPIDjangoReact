import React, { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { FEATURE_OVERVIEW_API } from "@/lib/api";
import { fetchDimensionMapping } from "@/lib/dimensions";
import { BarChart3, TrendingUp, Maximize2 } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import D3LineChart from "./D3LineChart";
import { useAuth } from "@/contexts/AuthContext";
import { logSessionState, addNavigationItem } from "@/lib/session";

interface ColumnInfo {
  column: string;
  data_type: string;
  unique_count: number;
  unique_values: string[];
}

interface FeatureOverviewCanvasProps {
  settings: any;
  onUpdateSettings: (s: any) => void;
}

const filterUnattributed = (mapping: Record<string, string[]>) =>
  Object.fromEntries(
    Object.entries(mapping || {}).filter(
      ([key]) => key.toLowerCase() !== "unattributed",
    ),
  );

const FeatureOverviewCanvas: React.FC<FeatureOverviewCanvasProps> = ({
  settings,
  onUpdateSettings,
}) => {
  const { user } = useAuth();
  const [dimensionMap, setDimensionMap] = useState<Record<string, string[]>>(
    filterUnattributed(settings.dimensionMap || {}),
  );
  const hasMappedIdentifiers = Object.values(dimensionMap).some(
    (ids) => ids.length > 0,
  );
  const [skuRows, setSkuRows] = useState<any[]>(
    Array.isArray(settings.skuTable) ? settings.skuTable : [],
  );
  const [activeRow, setActiveRow] = useState<number | null>(
    settings.activeRow ?? null,
  );
  const [statDataMap, setStatDataMap] = useState<
    Record<
      string,
      {
        timeseries: { date: string; value: number }[];
        summary: { avg: number; min: number; max: number };
      }
    >
  >(settings.statDataMap || {});
  const [activeMetric, setActiveMetric] = useState<string>(
    settings.activeMetric || settings.yAxes?.[0] || "",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (settings.yAxes && settings.yAxes.length > 0) {
      setActiveMetric((prev) =>
        prev && settings.yAxes.includes(prev) ? prev : settings.yAxes[0],
      );
    } else {
      setActiveMetric("");
    }
  }, [settings.yAxes]);

  useEffect(() => {
    setDimensionMap(filterUnattributed(settings.dimensionMap || {}));
  }, [settings.dimensionMap]);

  useEffect(() => {
    const loadMapping = async () => {
      const raw = await fetchDimensionMapping();
      const mapping = filterUnattributed(raw);
      setDimensionMap(mapping);
      onUpdateSettings({ dimensionMap: mapping });
    };
    loadMapping();
  }, []);

  useEffect(() => {
    if (hasMappedIdentifiers && skuRows.length === 0 && settings.dataSource) {
      // prefill SKUs only when a data source is configured
      displaySkus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dimensionMap, settings.dataSource]);

  useEffect(() => {
    setSkuRows(Array.isArray(settings.skuTable) ? settings.skuTable : []);
  }, [settings.skuTable]);

  useEffect(() => {
    setStatDataMap(settings.statDataMap || {});
  }, [settings.statDataMap]);

  useEffect(() => {
    setActiveRow(settings.activeRow ?? null);
  }, [settings.activeRow]);

  useEffect(() => {
    if (settings.activeMetric) {
      setActiveMetric(settings.activeMetric);
    }
  }, [settings.activeMetric]);

  useEffect(() => {
    if (settings.activeRow && settings.skuTable) {
      const row = settings.skuTable.find((r) => r.id === settings.activeRow);
      if (row) {
        viewStats(row);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.yAxes, settings.xAxis]);

  const summaryList: ColumnInfo[] = Array.isArray(settings.columnSummary)
    ? settings.columnSummary.filter(Boolean)
    : [];

  const dimensionCols = Object.values(dimensionMap).flat();
  const colSpan = dimensionCols.length + 2; // SR NO. + View Stat

  if (summaryList.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-gray-500">
        {error || "Please configure Feature Overview Settings"}
      </div>
    );
  }

  const getDataTypeColor = (type: string) => {
    switch (type.toLowerCase()) {
      case "string":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "int64":
      case "float64":
      case "numeric":
        return "bg-green-100 text-green-800 border-green-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const displaySkus = async () => {
    if (!settings.dataSource || !hasMappedIdentifiers) {
      console.warn("displaySkus called without data source or mapped identifiers");
      return;
    }
    setError(null);
    try {
      console.log("🔎 fetching cached dataframe for", settings.dataSource);
      const res = await fetch(
        `${FEATURE_OVERVIEW_API}/cached_dataframe?object_name=${encodeURIComponent(
          settings.dataSource,
        )}`,
        { credentials: 'include' }
      );
      if (!res.ok) {
        console.warn("⚠️ cached dataframe request failed", res.status);
        throw new Error("Failed to load data");
      }
      const text = await res.text();
      const [headerLine, ...rows] = text.trim().split(/\r?\n/);
      const headers = headerLine.split(",");
      const rowLines = Array.isArray(rows) ? rows : [];
      const data = rowLines.map((r) => {
        const vals = r.split(",");
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => {
          obj[h.toLowerCase()] = vals[i];
        });
        return obj;
      });
      const idCols = Object.values(dimensionMap).flat();
      const combos = new Map<string, any>();
      data.forEach((row) => {
        const key = idCols.map((k) => row[k.toLowerCase()] || "").join("||");
        if (!combos.has(key)) combos.set(key, row);
      });
      const table = Array.from(combos.values()).map((row, i) => ({
        id: i + 1,
        ...row,
      }));
    setSkuRows(table);
    const newSettings: any = { skuTable: table };
      if (!settings.yAxes || settings.yAxes.length === 0) {
        const lower = Array.isArray(settings.numericColumns)
          ? settings.numericColumns.map((c) => c.toLowerCase())
          : [];
        const defaults = ["salesvalue", "volume"].filter((d) =>
          lower.includes(d),
        );
      if (defaults.length > 0) {
        newSettings.yAxes = defaults;
      }
      }
      onUpdateSettings(newSettings);
      addNavigationItem(user?.id, {
        atom: 'feature-overview',
        action: 'displaySkus',
        dataSource: settings.dataSource,
        dimensionMap,
      });
      logSessionState(user?.id);
    } catch (e: any) {
      console.error("⚠️ failed to display SKUs", e);
      setError(e.message || "Error displaying SKUs");
      logSessionState(user?.id);
    }
  };

  const viewStats = async (row: any) => {
    const combo: Record<string, string> = {};
    Object.values(dimensionMap)
      .flat()
      .forEach((d) => {
        combo[d] = row[d.toLowerCase()];
      });
    if (!settings.yAxes || settings.yAxes.length === 0) return;
    setError(null);
    try {
      const result: Record<
        string,
        {
          timeseries: { date: string; value: number }[];
          summary: { avg: number; min: number; max: number };
        }
      > = {};
      for (const y of settings.yAxes) {
        const params = new URLSearchParams({
          object_name: settings.dataSource,
          y_column: y,
          combination: JSON.stringify(combo),
          x_column: settings.xAxis || "date",
        });
        const res = await fetch(
          `${FEATURE_OVERVIEW_API}/sku_stats?${params.toString()}`,
        );
        if (!res.ok) {
          throw new Error("Failed to fetch statistics");
        }
        result[y] = await res.json();
      }
      setStatDataMap(result);
      setActiveMetric(settings.yAxes[0]);
      setActiveRow(row.id);
      onUpdateSettings({
        statDataMap: result,
        activeMetric: settings.yAxes[0],
        activeRow: row.id,
      });
      addNavigationItem(user?.id, {
        atom: 'feature-overview',
        action: 'viewStats',
        metric: settings.yAxes[0],
        combination: combo,
      });
      logSessionState(user?.id);
    } catch (e: any) {
      setError(e.message || "Error fetching statistics");
      logSessionState(user?.id);
    }
  };

  return (
    <div className="w-full h-full p-6 pb-[50px] bg-gradient-to-br from-slate-50 to-blue-50 overflow-y-auto">
      {error && (
        <div
          className="mb-4 text-sm text-red-600 font-medium"
          data-testid="fo-error"
        >
          {error}
        </div>
      )}
      {summaryList.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center mb-6">
            <div className="w-1 h-8 bg-gradient-to-b from-blue-500 to-blue-600 rounded-full mr-4"></div>
            <h3 className="text-xl font-bold text-gray-900">Column View</h3>
          </div>

          <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm mb-6 overflow-hidden">
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-0.5">
              <div className="bg-white rounded-sm">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gradient-to-r from-gray-50 to-blue-50 border-b-2 border-blue-100">
                      <TableHead className="font-bold text-gray-800 text-center py-4">
                        Columns
                      </TableHead>
                      <TableHead className="font-bold text-gray-800 text-center py-4">
                        Data Type
                      </TableHead>
                      <TableHead className="font-bold text-gray-800 text-center py-4">
                        Unique Counts
                      </TableHead>
                      <TableHead className="font-bold text-gray-800 text-center py-4">
                        Unique Values
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.isArray(summaryList) &&
                      summaryList.map((c: ColumnInfo) => (
                        <TableRow
                          key={c.column}
                          className="hover:bg-blue-50/50 transition-all duration-200 border-b border-gray-100"
                        >
                          <TableCell className="font-semibold text-gray-900 text-center py-4">
                            {c.column}
                          </TableCell>
                          <TableCell className="text-center py-4">
                            <Badge
                              variant="outline"
                              className={`text-xs font-medium ${getDataTypeColor(c.data_type)} shadow-sm`}
                            >
                              {c.data_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-gray-700 text-center font-medium py-4">
                            {c.unique_count}
                          </TableCell>
                          <TableCell className="text-center py-4">
                            <div className="flex flex-wrap gap-1 justify-center">
                              {(Array.isArray(c.unique_values)
                                ? c.unique_values.slice(0, 3)
                                : []
                              ).map((v, i) => (
                                <Badge
                                  key={i}
                                  variant="outline"
                                  className="text-xs bg-gray-50 hover:bg-gray-100 transition-colors"
                                >
                                  {v}
                                </Badge>
                              ))}
                              {Array.isArray(c.unique_values) &&
                                c.unique_values.length > 3 && (
                                  <Badge
                                    variant="outline"
                                    className="text-xs bg-orange-50 text-orange-700 border-orange-200"
                                  >
                                    +{c.unique_values.length - 3}
                                  </Badge>
                                )}
                              {Array.isArray(c.unique_values) &&
                                c.unique_values.length === 0 && (
                                  <span className="text-xs text-gray-500 italic font-medium">
                                    Multiple values
                                  </span>
                                )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </Card>
        </div>
      )}

      {settings.hierarchicalView && settings.selectedColumns?.length > 0 && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {Object.keys(dimensionMap).length > 0 ? (
              Object.entries(dimensionMap).map(([dim, ids]) => (
                <Card
                  key={dim}
                  className="relative overflow-hidden bg-white border-2 border-blue-200 rounded-xl shadow-sm transition-all duration-300 hover:shadow-lg"
                >
                  <div className="relative px-4 py-3 border-b border-blue-200 bg-white">
                    <h4 className="text-sm font-bold text-foreground capitalize flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                      {dim}
                    </h4>
                  </div>
                  <div className="p-4">
                    <div className="flex flex-wrap gap-2">
                      {ids.map((id) => (
                        <span
                          key={id}
                          className="px-3 py-1.5 bg-white rounded-full text-sm shadow-sm border border-blue-200"
                        >
                          {id}
                        </span>
                      ))}
                    </div>
                  </div>
                </Card>
              ))
            ) : (
              <div className="col-span-1 text-sm text-gray-500">
                Please configure dimensions using Column Classifier
              </div>
            )}
          </div>

          {skuRows.length > 0 && (
            <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm overflow-hidden">
              <div className="bg-gradient-to-r from-purple-500 to-purple-600 p-0.5">
                <div className="bg-white rounded-sm overflow-x-auto">
                  <div className="max-h-[600px] overflow-y-auto">
                    <Table className="min-w-max">
                      <TableHeader className="sticky top-0 z-10 bg-white">
                        <TableRow>
                          <TableHead>SR NO.</TableHead>
                          {dimensionCols.map((d) => (
                            <TableHead key={d}>{d}</TableHead>
                          ))}
                          <TableHead>View Stat</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(Array.isArray(skuRows) ? skuRows : []).map((row) => (
                          <React.Fragment key={row.id}>
                            <TableRow className="border-b">
                              <TableCell>{row.id}</TableCell>
                              {dimensionCols.map((d) => (
                                <TableCell key={d}>{row[d.toLowerCase()]}</TableCell>
                              ))}
                              <TableCell>
                                <Button size="sm" onClick={() => viewStats(row)}>
                                  View Stat
                                </Button>
                              </TableCell>
                            </TableRow>
                            {activeRow === row.id && (
                              <TableRow>
                                <TableCell colSpan={colSpan}>
                                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mt-6">
                                    <div className="xl:col-span-1">
                                      <Card className="border-0 shadow-xl bg-white/90 backdrop-blur-sm overflow-hidden h-96 flex flex-col">
                                        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 p-4 flex items-center justify-between">
                                          <h4 className="font-bold text-white text-lg flex items-center">
                                            <TrendingUp className="w-5 h-5 mr-2" />
                                            {activeMetric || "Trend Analysis"}
                                          </h4>
                                          <Dialog>
                                            <DialogTrigger asChild>
                                              <button type="button" aria-label="Full screen">
                                                <Maximize2 className="w-5 h-5 text-white" />
                                              </button>
                                            </DialogTrigger>
                                            <DialogContent className="max-w-4xl">
                                              <D3LineChart
                                                data={statDataMap[activeMetric]?.timeseries || []}
                                                width={900}
                                                height={500}
                                                xLabel={settings.xAxis || "Date"}
                                                yLabel={activeMetric || "Value"}
                                              />
                                            </DialogContent>
                                          </Dialog>
                                        </div>
                                        <div className="p-6 flex-1 flex items-end justify-center">
                                          <D3LineChart
                                            data={statDataMap[activeMetric]?.timeseries || []}
                                            height={320}
                                            xLabel={settings.xAxis || "Date"}
                                            yLabel={activeMetric || "Value"}
                                          />
                                        </div>
                                      </Card>
                                    </div>
                                    <div className="xl:col-span-1">
                                      <Card className="border-0 shadow-xl bg-white/90 backdrop-blur-sm overflow-hidden h-96 flex flex-col">
                                        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 p-4">
                                          <h5 className="font-bold text-white text-sm flex items-center">
                                            <BarChart3 className="w-4 h-4 mr-2" />
                                            Statistical Summary
                                          </h5>
                                        </div>
                                        <div className="p-4 overflow-auto flex-1">
                                          <div className="overflow-x-auto">
                                            <table className="min-w-full text-xs whitespace-nowrap">
                                              <thead>
                                                <tr className="border-b border-gray-200">
                                                  <th className="p-2 text-left whitespace-nowrap sticky left-0 bg-white z-10">
                                                    Metric
                                                  </th>
                                                  <th className="p-2 text-right whitespace-nowrap">Avg</th>
                                                  <th className="p-2 text-right whitespace-nowrap">Min</th>
                                                  <th className="p-2 text-right whitespace-nowrap">Max</th>
                                                  <th className="p-2 text-right whitespace-nowrap">Action</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {(Array.isArray(settings.yAxes) ? settings.yAxes : []).map((m) => (
                                                  <tr key={m} className="border-b last:border-0">
                                                    <td className="p-2 whitespace-nowrap sticky left-0 bg-white z-10">{m}</td>
                                                    <td className="p-2 text-right whitespace-nowrap">
                                                      {statDataMap[m]?.summary.avg?.toFixed(2) ?? "-"}
                                                    </td>
                                                    <td className="p-2 text-right whitespace-nowrap">
                                                      {statDataMap[m]?.summary.min?.toFixed(2) ?? "-"}
                                                    </td>
                                                    <td className="p-2 text-right whitespace-nowrap">
                                                      {statDataMap[m]?.summary.max?.toFixed(2) ?? "-"}
                                                    </td>
                                                    <td className="p-2 text-right whitespace-nowrap">
                                                      <button
                                                        className="text-blue-600 hover:text-blue-800 font-medium underline transition-colors"
                                                        onClick={() => {
                                                          setActiveMetric(m);
                                                          onUpdateSettings({ activeMetric: m });
                                                        }}
                                                      >
                                                        View
                                                      </button>
                                                    </td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </div>
                                        </div>
                                      </Card>
                                    </div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </React.Fragment>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};

export default FeatureOverviewCanvas;
