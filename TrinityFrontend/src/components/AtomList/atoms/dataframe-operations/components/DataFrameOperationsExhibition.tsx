import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, FileText, Table, Share2, Printer } from 'lucide-react';
import { DataFrameData } from '../DataFrameOperationsAtom';

interface DataFrameOperationsExhibitionProps {
  data: DataFrameData | null;
}

function safeToString(val: any): string {
  if (val === undefined || val === null) return '';
  try {
    return val.toString();
  } catch {
    return '';
  }
}

const DataFrameOperationsExhibition: React.FC<DataFrameOperationsExhibitionProps> = ({ data }) => {
  const downloadCSV = () => {
    if (!data) return;
    
    const csvContent = [
      data.headers.join(','),
      ...data.rows.map(row => 
        data.headers.map(header => safeToString(row[header])).join(',')
      )
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${data.fileName.replace(/\.[^/.]+$/, '')}_edited.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadJSON = () => {
    if (!data) return;
    
    const jsonContent = JSON.stringify(data.rows, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${data.fileName.replace(/\.[^/.]+$/, '')}_edited.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadExcel = () => {
    if (!data) return;
    
    // For now, download as CSV. In a real implementation, use a library like xlsx
    downloadCSV();
  };

  const printData = () => {
    if (!data) return;
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    const htmlContent = `
      <html>
        <head>
          <title>${data.fileName}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f5f5f5; font-weight: bold; }
            .header { margin-bottom: 20px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Data Frame Operations Report</h1>
            <p><strong>File:</strong> ${data.fileName}</p>
            <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
            <p><strong>Rows:</strong> ${data.rows.length} | <strong>Columns:</strong> ${data.headers.length}</p>
          </div>
          <table>
            <thead>
              <tr>
                ${data.headers.map(header => `<th>${header}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${data.rows.map(row => 
                `<tr>${data.headers.map(header => `<td>${safeToString(row[header])}</td>`).join('')}</tr>`
              ).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;
    
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.print();
  };

  if (!data) {
    return (
      <Card className="p-4 border border-border">
        <div className="text-center py-8">
          <Download className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h4 className="font-medium text-foreground mb-2">No Data Available</h4>
          <p className="text-sm text-muted-foreground">Upload data to enable export options</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Export Options */}
      <Card className="border border-border shadow-sm">
        <div className="p-4">
          <h4 className="font-medium text-foreground mb-4 flex items-center">
            <Download className="w-4 h-4 text-primary mr-2" />
            Export Data
          </h4>
          <div className="space-y-2">
            <Button 
              onClick={downloadCSV}
              variant="outline" 
              className="w-full justify-start text-sm"
            >
              <FileText className="w-4 h-4 mr-2" />
              Download as CSV
            </Button>
            <Button 
              onClick={downloadExcel}
              variant="outline" 
              className="w-full justify-start text-sm"
            >
              <Table className="w-4 h-4 mr-2" />
              Download as Excel
            </Button>
            <Button 
              onClick={downloadJSON}
              variant="outline" 
              className="w-full justify-start text-sm"
            >
              <FileText className="w-4 h-4 mr-2" />
              Download as JSON
            </Button>
          </div>
        </div>
      </Card>

      {/* Print Options */}
      <Card className="border border-border shadow-sm">
        <div className="p-4">
          <h4 className="font-medium text-foreground mb-4 flex items-center">
            <Printer className="w-4 h-4 text-primary mr-2" />
            Print & Share
          </h4>
          <div className="space-y-2">
            <Button 
              onClick={printData}
              variant="outline" 
              className="w-full justify-start text-sm"
            >
              <Printer className="w-4 h-4 mr-2" />
              Print Data
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-start text-sm"
              disabled
            >
              <Share2 className="w-4 h-4 mr-2" />
              Share Link (Coming Soon)
            </Button>
          </div>
        </div>
      </Card>

      {/* Data Information */}
      <Card className="border border-border shadow-sm">
        <div className="p-4">
          <h4 className="font-medium text-foreground mb-4">Export Information</h4>
          <div className="space-y-3">
            <div className="bg-muted/20 rounded-lg p-3">
              <h5 className="font-medium text-foreground mb-2">Current Dataset</h5>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">File Name:</span>
                  <span className="font-medium text-foreground">{data.fileName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Rows:</span>
                  <Badge variant="outline">{data.rows.length.toLocaleString()}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Columns:</span>
                  <Badge variant="outline">{data.headers.length}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pinned Columns:</span>
                  <Badge variant="outline">{data.pinnedColumns.length}</Badge>
                </div>
              </div>
            </div>
            
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
              <h5 className="font-medium text-primary mb-2">Export Notes</h5>
              <ul className="text-xs text-primary/80 space-y-1">
                <li>• Current filters and sorting will be applied</li>
                <li>• Cell highlighting will be preserved in Excel format</li>
                <li>• All data modifications are included</li>
                <li>• Original data types are maintained</li>
              </ul>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default DataFrameOperationsExhibition;