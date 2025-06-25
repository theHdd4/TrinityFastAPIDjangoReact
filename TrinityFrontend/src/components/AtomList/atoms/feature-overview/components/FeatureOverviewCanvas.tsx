import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { VALIDATE_API } from '@/lib/api';

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
    <div className="w-full h-full p-4 overflow-y-auto space-y-6">
      {settings.columnSummary && settings.columnSummary.length > 0 && (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-center">Column</TableHead>
                <TableHead className="text-center">Type</TableHead>
                <TableHead className="text-center">Unique</TableHead>
                <TableHead className="text-center">Samples</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {settings.columnSummary.map((c: ColumnInfo) => (
                <TableRow key={c.column} className="border-b">
                  <TableCell className="text-center font-medium">{c.column}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className={`text-xs ${getDataTypeColor(c.data_type)}`}>{c.data_type}</Badge>
                  </TableCell>
                  <TableCell className="text-center">{c.unique_count}</TableCell>
                  <TableCell className="text-center">
                    <div className="flex flex-wrap gap-1 justify-center">
                      {c.unique_values.slice(0,3).map((v,i)=>(
                        <Badge key={i} variant="outline" className="text-xs">{v}</Badge>
                      ))}
                      {c.unique_values.length>3 && <Badge variant="outline" className="text-xs">+{c.unique_values.length-3}</Badge>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {settings.hierarchicalView && settings.selectedColumns?.length > 0 && (
        <div className="space-y-4">
          <Card className="p-4 space-y-2">
            <div className="flex flex-wrap gap-3 relative">
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
            <div className="flex flex-wrap gap-3 relative mt-4">
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
            <Button onClick={displaySkus} className="mt-4">
              Display SKUs
            </Button>
          </Card>

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
