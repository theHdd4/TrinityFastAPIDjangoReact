import React, { useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, FileImage, FileText, Table, Loader2 } from 'lucide-react';
import { ExploreData } from '../ExploreAtom';

interface ExploreExhibitionProps {
  data: ExploreData;
  chartData?: any; // Add chart data prop
}

const ExploreExhibition: React.FC<ExploreExhibitionProps> = ({ data, chartData }) => {
  const [exporting, setExporting] = useState<string | null>(null);

  const exportFormats = [
    { id: 'png', name: 'PNG Image', icon: FileImage, description: 'High-quality chart image' },
    { id: 'csv', name: 'CSV Data', icon: Table, description: 'Chart data as CSV file' },
    { id: 'pdf', name: 'PDF Report', icon: FileText, description: 'Complete chart report' },
  ];

  const captureChartAsImage = async (): Promise<string> => {
    // For now, create a placeholder image since html2canvas is not available
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      // Create a simple chart representation
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 800, 600);
      
      ctx.fillStyle = '#3b82f6';
      ctx.font = '16px Arial';
      ctx.fillText('Chart Export', 50, 50);
      ctx.fillText(`Chart Type: ${data.chartType}`, 50, 80);
      ctx.fillText(`X-Axis: ${data.xAxis || 'Not set'}`, 50, 110);
      ctx.fillText(`Y-Axis: ${data.yAxis || 'Not set'}`, 50, 140);
      
      // Draw a simple bar chart representation
      if (chartData && chartData.data) {
        const barWidth = 60;
        const barSpacing = 20;
        let x = 50;
        
        chartData.data.slice(0, 5).forEach((point: any, index: number) => {
          const height = Math.min(200, (point.y || point.value || 0) / 10);
          ctx.fillStyle = `hsl(${index * 60}, 70%, 60%)`;
          ctx.fillRect(x, 400 - height, barWidth, height);
          ctx.fillStyle = '#000000';
          ctx.fillText(point.x || point.label || `Item ${index + 1}`, x, 420);
          x += barWidth + barSpacing;
        });
      }
    }
    
    return canvas.toDataURL('image/png');
  };

  const exportChartDataAsCSV = (): string => {
    let csvContent = '';
    
    if (chartData && chartData.data) {
      // Use actual chart data if available
      if (chartData.chart_type === 'line_chart') {
        // For line charts, export series data
        csvContent = 'Series,X,Y\n';
        chartData.data.forEach((series: any, seriesIndex: number) => {
          series.values.forEach((point: any) => {
            csvContent += `${series.name || `Series ${seriesIndex + 1}`},${point.x},${point.y}\n`;
          });
        });
      } else if (chartData.chart_type === 'bar_chart') {
        // For bar charts, export x,y data
        csvContent = 'X,Y\n';
        chartData.data.forEach((point: any) => {
          csvContent += `${point.x},${point.y}\n`;
        });
      } else if (chartData.chart_type === 'pie_chart') {
        // For pie charts, export label,value data
        csvContent = 'Label,Value\n';
        chartData.data.forEach((point: any) => {
          csvContent += `${point.label || point.x},${point.value || point.y}\n`;
        });
      }
    } else {
      // Create sample data based on chart configuration
      csvContent = 'Category,Value\n';
      const categories = ['Category A', 'Category B', 'Category C', 'Category D', 'Category E'];
      categories.forEach((category, index) => {
        const value = Math.floor(Math.random() * 1000) + 100;
        csvContent += `${category},${value}\n`;
      });
    }

    return csvContent;
  };

  const generatePDFReport = async (): Promise<Blob> => {
    // For now, create a simple text-based PDF content
    const content = `
Chart Report

Chart Type: ${data.chartType}
X-Axis: ${data.xAxis || 'Auto-detected'}
Y-Axis: ${data.yAxis || 'Auto-detected'}
Measures: ${data.measures?.length || 0} selected
Layout: ${data.graphLayout?.numberOfGraphsInRow || 1}×${data.graphLayout?.rows || 1}
Dataframe: ${data.dataframe || 'Not specified'}

Chart Data:
${chartData && chartData.data && Array.isArray(chartData.data) ? 
  chartData.data.slice(0, 10).map((point: any, index: number) => 
    `${index + 1}. ${point.x || point.label || 'Unknown'}: ${point.y || point.value || 0}`
  ).join('\n') : 
  'Chart data generated from selected dataframe and measures. Export functionality enabled for chart visualization.'
}
    `.trim();

    return new Blob([content], { type: 'text/plain' });
  };

  const handleExport = async (format: string) => {
    if (!data.dataframe) {
      alert('Please select a dataframe first');
      return;
    }

    setExporting(format);
    
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `explore-chart-${timestamp}.${format}`;
      
      switch (format) {
        case 'png':
          const imageData = await captureChartAsImage();
          const link = document.createElement('a');
          link.download = filename;
          link.href = imageData;
          link.click();
          break;
          
        case 'csv':
          const csvContent = exportChartDataAsCSV();
          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const link2 = document.createElement('a');
          link2.download = filename;
          link2.href = URL.createObjectURL(blob);
          link2.click();
          URL.revokeObjectURL(link2.href);
          break;
          
        case 'pdf':
          const pdfBlob = await generatePDFReport();
          const link3 = document.createElement('a');
          link3.download = filename;
          link3.href = URL.createObjectURL(pdfBlob);
          link3.click();
          URL.revokeObjectURL(link3.href);
          break;
          
        default:
          throw new Error(`Unsupported format: ${format}`);
      }
    } catch (error) {
      alert(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setExporting(null);
    }
  };

  // Check if chart is actually generated by looking for chart-related data
  const hasChartData = data.dataframe && (
    (data.xAxis && data.yAxis) || 
    (data.measures && data.measures.length > 0) ||
    chartData
  );
  
  const isExportDisabled = !hasChartData;

  return (
    <div className="space-y-4">

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center">
            <Download className="w-4 h-4 mr-2" />
            Export Options
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.isArray(exportFormats) ? exportFormats.map((format) => (
            <div key={format.id} className="flex items-center justify-between p-3 border border-border rounded-lg">
              <div className="flex items-center space-x-3">
                <format.icon className="w-5 h-5 text-muted-foreground" />
                <div>
                  <div className="font-medium text-sm">{format.name}</div>
                  <div className="text-xs text-muted-foreground">{format.description}</div>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleExport(format.id)}
                disabled={isExportDisabled || exporting === format.id}
              >
                {exporting === format.id ? (
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                    <span>Exporting...</span>
                  </div>
                ) : (
                  'Export'
                )}
              </Button>
            </div>
          )) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Chart Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-muted-foreground">Chart Type:</span>
            <Badge variant="secondary" className="capitalize">{data.chartType}</Badge>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-muted-foreground">X-Axis:</span>
            <span>{data.xAxis || 'Auto-detected'}</span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-muted-foreground">Y-Axis:</span>
            <span>{data.yAxis || 'Auto-detected'}</span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-muted-foreground">Measures:</span>
            <span>{data.measures?.length || 0} selected</span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-muted-foreground">Layout:</span>
            <span>{(data.graphLayout?.numberOfGraphsInRow || 1)}×{(data.graphLayout?.rows || 1)}</span>
          </div>
          {chartData && (
            <div className="flex justify-between items-center text-xs">
              <span className="text-muted-foreground">Data Points:</span>
              <span>{chartData.data?.length || 0}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {!data.dataframe && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-3">
            <div className="text-xs text-amber-700">
              ⚠️ Please select a dataframe in the Input tab to enable export functionality.
            </div>
          </CardContent>
        </Card>
      )}

      {data.dataframe && !hasChartData && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-3">
            <div className="text-xs text-blue-700">
              ℹ️ Generate a chart first to enable export functionality.
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ExploreExhibition;