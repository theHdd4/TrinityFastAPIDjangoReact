import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { VALIDATE_API } from '@/lib/api';
import { BarChart3, TrendingUp } from 'lucide-react';

interface ColumnInfo {
  column: string;
  data_type: string;
  unique_count: number;
  unique_values: string[];
}

interface FeatureOverviewCanvasProps {
  settings: any;
}

const FeatureOverviewCanvas: React.FC<FeatureOverviewCanvasProps> = ({ settings }) => {
  const [marketDims, setMarketDims] = useState<string[]>(settings.marketDims || []);
  const [productDims, setProductDims] = useState<string[]>(settings.productDims || []);
  const [skuRows, setSkuRows] = useState<any[]>(settings.skuTable || []);
  const [showMarketSelect, setShowMarketSelect] = useState(false);
  const [showProductSelect, setShowProductSelect] = useState(false);

  if (!settings.columnSummary || settings.columnSummary.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-gray-500">
        Please configure Feature Overview Settings
      </div>
    );
  }

  const getDataTypeColor = (type: string) => {
    switch (type.toLowerCase()) {
      case 'string':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'int64':
      case 'float64':
      case 'numeric':
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const displaySkus = async () => {
    const res = await fetch(`${VALIDATE_API}/download_dataframe?object_name=${encodeURIComponent(settings.dataSource)}`);
    if (!res.ok) return;
    const { url } = await res.json();
    const text = await fetch(url).then(r => r.text());
    const [headerLine, ...rows] = text.trim().split(/\r?\n/);
    const headers = headerLine.split(',');
    const data = rows.map(r => {
      const vals = r.split(',');
      const obj: Record<string,string> = {};
      headers.forEach((h,i)=>{obj[h.toLowerCase()] = vals[i];});
      return obj;
    });
    const combos = new Map<string, any>();
    data.forEach(row => {
      const key = [...marketDims, ...productDims].map(k=>row[k.toLowerCase()]||'').join('||');
      if (!combos.has(key)) combos.set(key, row);
    });
    const table = Array.from(combos.values()).map((row, i) => ({ id: i+1, ...row }));
    setSkuRows(table);
  };

  return (
    <div className="w-full h-full p-6 bg-gradient-to-br from-slate-50 to-blue-50 overflow-y-auto">
      {settings.columnSummary && settings.columnSummary.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center mb-6">
            <div className="w-1 h-8 bg-gradient-to-b from-blue-500 to-blue-600 rounded-full mr-4"></div>
            <h3 className="text-xl font-bold text-gray-900">Column View</h3>
          </div>

          <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm mb-6 overflow-hidden">
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-1">
              <div className="bg-white rounded-sm">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gradient-to-r from-gray-50 to-blue-50 border-b-2 border-blue-100">
                      <TableHead className="font-bold text-gray-800 text-center py-4">Columns</TableHead>
                      <TableHead className="font-bold text-gray-800 text-center py-4">Data Type</TableHead>
                      <TableHead className="font-bold text-gray-800 text-center py-4">Unique Counts</TableHead>
                      <TableHead className="font-bold text-gray-800 text-center py-4">Unique Values</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {settings.columnSummary.map((c: ColumnInfo) => (
                      <TableRow key={c.column} className="hover:bg-blue-50/50 transition-all duration-200 border-b border-gray-100">
                        <TableCell className="font-semibold text-gray-900 text-center py-4">{c.column}</TableCell>
                        <TableCell className="text-center py-4">
                          <Badge variant="outline" className={`text-xs font-medium ${getDataTypeColor(c.data_type)} shadow-sm`}>{c.data_type}</Badge>
                        </TableCell>
                        <TableCell className="text-gray-700 text-center font-medium py-4">{c.unique_count}</TableCell>
                        <TableCell className="text-center py-4">
                          <div className="flex flex-wrap gap-1 justify-center">
                            {c.unique_values.slice(0,3).map((v,i)=>(
                              <Badge key={i} variant="outline" className="text-xs bg-gray-50 hover:bg-gray-100 transition-colors">{v}</Badge>
                            ))}
                            {c.unique_values.length>3 && (
                              <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200">+{c.unique_values.length-3}</Badge>
                            )}
                            {c.unique_values.length===0 && (
                              <span className="text-xs text-gray-500 italic font-medium">Multiple values</span>
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
            {/* Market Dimension */}
            <Card className="border-0 shadow-xl bg-white/90 backdrop-blur-sm overflow-hidden transform hover:scale-105 transition-all duration-300">
              <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-4">
                <h4 className="font-bold text-white text-lg flex items-center">
                  <BarChart3 className="w-5 h-5 mr-2" />
                  Market Dimension
                </h4>
              </div>
              <div className="p-6">
                <div className="flex flex-wrap gap-3">
                  {marketDims.map(m => (
                    <Badge key={m} className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-2 font-medium">
                      {m}
                    </Badge>
                  ))}
                  <div className="relative">
                    <div
                      className="flex items-center justify-center w-10 h-10 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-full font-bold text-lg shadow-lg cursor-pointer"
                      onClick={() => setShowMarketSelect(v => !v)}
                    >
                      +
                    </div>
                    {showMarketSelect && (
                      <select
                        className="absolute z-10 mt-2 p-1 border rounded bg-white text-sm"
                        onChange={e => {
                          const val = e.target.value;
                          if (val) {
                            setMarketDims([...marketDims, val]);
                            setShowMarketSelect(false);
                          }
                        }}
                      >
                        <option value="">Select...</option>
                        {settings.selectedColumns
                          .filter((c: string) => !marketDims.includes(c) && !productDims.includes(c))
                          .map((c: string) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                      </select>
                    )}
                  </div>
                </div>
              </div>
            </Card>

            {/* Product Dimension */}
            <Card className="border-0 shadow-xl bg-white/90 backdrop-blur-sm overflow-hidden transform hover:scale-105 transition-all duration-300">
              <div className="bg-gradient-to-r from-green-500 to-green-600 p-4">
                <h4 className="font-bold text-white text-lg flex items-center">
                  <TrendingUp className="w-5 h-5 mr-2" />
                  Product Dimension
                </h4>
              </div>
              <div className="p-6">
                <div className="flex flex-wrap gap-3">
                  {productDims.map(p => (
                    <Badge key={p} className="bg-gradient-to-r from-green-500 to-green-600 text-white px-4 py-2 font-medium">
                      {p}
                    </Badge>
                  ))}
                  <div className="relative">
                    <div
                      className="flex items-center justify-center w-10 h-10 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-full font-bold text-lg shadow-lg cursor-pointer"
                      onClick={() => setShowProductSelect(v => !v)}
                    >
                      +
                    </div>
                    {showProductSelect && (
                      <select
                        className="absolute z-10 mt-2 p-1 border rounded bg-white text-sm"
                        onChange={e => {
                          const val = e.target.value;
                          if (val) {
                            setProductDims([...productDims, val]);
                            setShowProductSelect(false);
                          }
                        }}
                      >
                        <option value="">Select...</option>
                        {settings.selectedColumns
                          .filter((c: string) => !productDims.includes(c) && !marketDims.includes(c))
                          .map((c: string) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                      </select>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          </div>

          <Button onClick={displaySkus} className="mt-4">
            Display SKUs
          </Button>

          {skuRows.length > 0 && (
            <Card className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SR NO.</TableHead>
                    {[...marketDims, ...productDims].map(d => (
                      <TableHead key={d}>{d}</TableHead>
                    ))}
                    <TableHead>View Stat</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {skuRows.map(row => (
                    <TableRow key={row.id} className="border-b">
                      <TableCell>{row.id}</TableCell>
                      {[...marketDims, ...productDims].map(d => (
                        <TableCell key={d}>{row[d.toLowerCase()]}</TableCell>
                      ))}
                      <TableCell>
                        <Button size="sm">View Stat</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};

export default FeatureOverviewCanvas;
